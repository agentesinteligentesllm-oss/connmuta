import { confirm, isCancel, multiselect, password, select, text } from "@clack/prompts";

/**
 * The wizard's sole `@clack/prompts` seam (design.md §8.2, D-38): every wizard step reaches
 * `text`/`select`/`multiselect`/`confirm`/`isCancel` only through this port, so wizard tests can
 * script answers with a fake `Prompter` instead of driving a real TTY. This is the only file under
 * `src/installer/` that imports `@clack/prompts` directly.
 */

/** One labeled choice for {@link Prompter.select}/{@link Prompter.multiselect}, mirrors `@clack/prompts`' `Option`. */
export interface PrompterOption {
	readonly value: unknown;
	readonly label: string;
}

export interface PasswordPromptOptions {
	readonly message: string;
}

export interface TextPromptOptions {
	readonly message: string;
	readonly placeholder?: string;
	readonly defaultValue?: string;
}

export interface SelectPromptOptions {
	readonly message: string;
	readonly options: readonly PrompterOption[];
}

export interface MultiselectPromptOptions {
	readonly message: string;
	readonly options: readonly PrompterOption[];
}

export interface ConfirmPromptOptions {
	readonly message: string;
	readonly initialValue?: boolean;
}

/** The wizard's own prompting port (D-38); wizard code depends on this, never on `@clack/prompts` itself. */
export interface Prompter {
	password(opts: PasswordPromptOptions): Promise<string | symbol>;
	text(opts: TextPromptOptions): Promise<string | symbol>;
	select(opts: SelectPromptOptions): Promise<unknown | symbol>;
	multiselect(opts: MultiselectPromptOptions): Promise<unknown[] | symbol>;
	confirm(opts: ConfirmPromptOptions): Promise<boolean | symbol>;
	isCancel(value: unknown): boolean;
}

/**
 * Refuses a non-interactive `password()` call (design.md §6, D-37): a piped/CI stdin has no masked
 * input at all, so reading a token through it would silently defeat `@clack/prompts`' own masking.
 */
function assertInteractiveStdin(): void {
	if (!process.stdin.isTTY) {
		throw new Error("Prompter.password requires an interactive terminal (process.stdin.isTTY is falsy)");
	}
}

/** The real adapter: a thin pass-through to `@clack/prompts`, never reimplementing its prompting logic. */
export function createPrompter(): Prompter {
	return {
		// `async` on purpose: the TTY guard's throw must surface as a rejected promise, matching every
		// other method here, rather than as a synchronous throw out of a function typed to return one.
		async password(opts) {
			assertInteractiveStdin();
			return password({ message: opts.message });
		},
		text(opts) {
			return text(opts);
		},
		select(opts) {
			return select({ message: opts.message, options: [...opts.options] });
		},
		multiselect(opts) {
			return multiselect({ message: opts.message, options: [...opts.options] });
		},
		confirm(opts) {
			return confirm(opts);
		},
		isCancel(value) {
			return isCancel(value);
		},
	};
}
