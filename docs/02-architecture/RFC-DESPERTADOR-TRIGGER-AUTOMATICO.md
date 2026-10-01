# RFC — Despertador y Trigger Autónomo de Agentes para Canales Privados (Telegram / Conmuta)

> **Origen:** Instrucción directa del Director (Luis Gutiérrez) — 2026-09-30.
> **Estado:** `open` como requerimiento · **liquidado por [ADR-0032](../03-adr/0032-wake-satellite-and-per-binding-ladder.md) y CONSTITUTION §3.1, fase F7a (2026-09-30)**. Ver la nota de enmienda abajo.
> **Alcance:** Conmuta (`telegram_bus_agent`) y su integración con los arneses de los agentes (`frisco-erp`).

---

> **Amendment note (Kairo, 2026-09-30 — English, per the repository's language contract; the Director's own
text below is kept verbatim, no line of it rewritten).**
>
> This request is landed as [ADR-0032](../03-adr/0032-wake-satellite-and-per-binding-ladder.md), the
> CONSTITUTION §3.1 amendment, backlog B-104 and phase **F7a**. Three points were corrected instead of
> implemented as written, each with evidence:
>
> 1. **§3.1 already ships.** The daemon's F4 doorbell (`src/daemon/serve/doorbell.ts`) already selects exactly
>    `via === "direct" || type === "BROADCAST" || to === agentId`, with the sender verified against the
>    binding's roster (`reverseRosterLookup`), and answers a body-less, closed-key-set summary. No `/events/wake`
>    route is needed and none is added: the IPC route set stays `/tools/*` + `/channel/{doorbell,cursor}`
>    (`src/shared/ipc-contract.ts:101-106`). What remains is §3.2's wake half, and it belongs outside the core.
> 2. **§4.1's config location is void.** `conmuta.json` is a committed, id-only project file (D5); this
>    repository's own copy holds only `schema_version`, `project_id`, `group_id`, `roster`. An execution policy
>    is machine-local: the ladder lives per binding under the daemon home and is written only by an explicit,
>    audit-logged human action (ADR-0032 R4, PT-35).
> 3. **§2's security premise is corrected.** A private group and a roster filter *who may send*; they say nothing
>    about the content a legitimately rostered peer carries, and a peer's own context can be poisoned. The
>    agent's ability to "discriminar peticiones e instrucciones de negocio" is a behaviour, not a control, and no
>    test pins behaviour. A woken headless turn has **no human at a permission prompt**, so the capability
>    profile is the control (ADR-0032 R5/R7; THREAT-MODEL T24).
>
> The optional mode the Director asked for is the per-binding ladder `off` (default) → `notify` (notify a human;
> no turn) → `wake` (one read/reply-only turn) → `autopilot` (one turn in a declared, confined act profile).
> All of it is opt-in, machine-local, audited and reversible.

---

## 1 · Contexto y Justificación

En la arquitectura base de Conmuta v2:
- El daemon (`conmuta daemon`) ejecuta un sondeo continuo (*long-polling*) contra la API de Telegram y almacena los sobres recibidos en el ledger SQLite (`~/.conmuta/ledger.db`).
- Por diseño de aislamiento de autonomía (ADR-0006 y ADR-0029 §5), el núcleo de Conmuta actúa como un conmutador pasivo: no ejecuta procesos, no invoca shells ni dispara turnos de los modelos por su cuenta.
- El agente en su arnés interactivo (Pi, Claude Code, Cursor, etc.) únicamente lee los mensajes cuando un operador humano ingresa a la sesión y solicita una lectura mediante la herramienta `conmuta_fetch` (o cuando un canal como el de Claude Code suena el timbre sin contenido).

### El problema operativo
En la operación real multi-agente:
1. Cuando un agente emite un `BROADCAST` (aviso para todos) o un `REQUEST` dirigido a otro agente específico, el destinatario **no se entera inmediatamente**.
2. El agente permanece en reposo hasta que un humano acude a su terminal a "despertarlo", rompiendo la agilidad de coordinación y la promesa de un bus entre agentes autónomos.
3. Se requiere que el sistema sea reactivo: que un mensaje entrante despierte al agente en turno para atender de inmediato según le corresponda.

---

## 2 · Premisas del Entorno Operativo

1. **Grupo aislado y privado:** El canal de Telegram está confinado a bots verificados y a los integrantes del equipo. El `roster` autentica a cada participante por su `user_id` numérico y token.
2. **Capacidad de discernimiento del agente:** Los agentes homologados conocen su rol de gobernanza (arquitecto, documentador, revisor, árbitro) y cuentan con capacidad de razonamiento para evaluar si una solicitud es legítima, si está dentro de su alcance, o si se trata de una instrucción que debe ser rechazada, escalada o auditada.
3. **Equilibrio seguridad-operación:** El riesgo de ejecución inadvertida se mitiga manteniendo el framing estricto de entrada (`UNTRUSTED-PEER-INPUT`, ADR-0012) y permitiendo que la activación automática esté habilitada explícitamente por configuración para entornos confiables.

---

## 3 · Propuesta de Arquitectura: El Despertador / Trigger Runner

Se propone formalizar e implementar el componente disparador (**Runner / Despertador Autónomo**, backlog **B-06 / B-104**):

### 3.1 · Detección de Mensajes de Interés en el Daemon
Cuando el daemon de Conmuta procesa un nuevo `update` de Telegram y persiste el envelope en `ledger.db`:
- Si el mensaje es de tipo `BROADCAST` (destinado a todos los agentes del roster).
- O si el mensaje está explícitamente dirigido al `agent_id` local (`to == @mi-agente`).
El daemon emite una señal de evento en el IPC local (`/events/wake` o socket de notificación).

### 3.2 · Mecanismo de Activación (Wake-up Trigger)
Un servicio satélite de ejecución o adaptador de arnés (ej. `@conmuta/runner` o integración con el runner del coordinador):
1. **Detección del evento:** Escucha la señal del daemon.
2. **Inyección de Turno:**
   - **En sesiones interactivas:** Envía un trigger/señal a la sesión del agente para forzar la ejecución de un ciclo de lectura (`conmuta_fetch`).
   - **En modo desatendido (Headless):** Invoca el comando del arnés configurado (`pi -p`, `claude -p`, `opencode run`, etc.) inyectando un prompt de sistema acotado:
     > *"Tienes un mensaje nuevo en el bus de Telegram (hilo `<thread_id>`, remitente `<from>`). Ejecuta `conmuta_fetch`, evalúa la petición según tu rol y responde o actualiza el estado según corresponda."*

### 3.3 · Flujo del Agente al Despertar
1. El agente se activa y ejecuta `conmuta_fetch`.
2. Lee el mensaje delimitado de forma segura en `UNTRUSTED-PEER-INPUT`.
3. Analiza la petición contra las reglas de gobernanza del proyecto.
4. Si la acción está dentro de sus facultades (ej. correr una suite, dar acuse de recibo, revisar un diff), ejecuta y responde por el bus (`conmuta_send`).
5. Si requiere intervención humana o está fuera de alcance, notifica el bloqueo o escala a su colaborador humano.

---

## 4 · Plan de Ajuste e Implementación

1. **Configuración en `conmuta.json`:**
   Añadir banderas por proyecto:
   ```json
   {
     "runner": {
       "enabled": true,
       "harness": "pi",
       "trigger_on": ["BROADCAST", "DIRECT_MENTION"],
       "cooldown_seconds": 10
     }
   }
   ```
2. **Fase de desarrollo:**
   - Registrar formalmente en el backlog de Conmuta como **B-104**.
   - Diseñar el runner satélite en la fase post-F6 para desacoplar el core de la invocación de procesos externos.
   - Proveer adaptadores para los arneses del equipo (Pi y Claude Code inicialmente).
