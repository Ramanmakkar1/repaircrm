/**
 * A recording stand-in for the Prisma client.
 *
 * WHY NOT A REAL DATABASE. The behaviour these tests are protecting is not
 * "does Postgres store a row" — it is "does this code refuse an overpayment",
 * "does it write exactly one Payment for two deliveries of the same Stripe
 * event", and above all "does every query carry the session's shopId". All
 * three are decidable from the ARGUMENTS the code passes to Prisma, and a fake
 * that records those arguments can assert them directly instead of inferring
 * them from what came back.
 *
 * It is also the only way to test the tenant filter honestly: a real query with
 * a missing `shopId` still returns a row, so it passes. A recorded query with a
 * missing `shopId` fails the assertion.
 *
 * HOW IT WORKS. `fakeClient` is a Proxy shaped like `db`. `db.invoice.findFirst`
 * resolves to the handler registered under the key `"invoice.findFirst"`, and
 * every call — handled or not — is appended to `calls`. An unregistered query
 * throws by name, so a code path that starts touching a new table fails loudly
 * rather than silently receiving `undefined`.
 *
 * `$transaction(fn)` runs `fn` with the same client, synchronously in-process.
 * That deliberately does NOT model rollback: the tests that care about atomicity
 * assert the ERROR and the absence of a commit-side effect (an emitted event, a
 * returned id), which is what the application code can actually observe.
 */

export type DbCall = {
  /** e.g. "invoice.findFirst", or "$transaction". */
  path: string;
  args: Record<string, unknown>;
};

export type DbHandler = (args: Record<string, unknown>) => unknown;

/** Registered per test as `handlers["invoice.findFirst"] = () => ({ … })`. */
export const handlers: Record<string, DbHandler> = {};

/** Every query the code under test issued, in order. */
export const calls: DbCall[] = [];

export function resetDb(): void {
  for (const key of Object.keys(handlers)) delete handlers[key];
  calls.length = 0;
}

/** Every recorded call to one model+operation pair. */
export function callsTo(path: string): DbCall[] {
  return calls.filter((call) => call.path === path);
}

/** The `where` clause of the first call to `path`, for tenant assertions. */
export function whereOf(path: string): Record<string, unknown> {
  const call = callsTo(path)[0];
  if (!call) throw new Error(`no recorded call to ${path}`);
  return (call.args.where ?? {}) as Record<string, unknown>;
}

/** The `data` payload of the first call to `path`. */
export function dataOf(path: string): Record<string, unknown> {
  const call = callsTo(path)[0];
  if (!call) throw new Error(`no recorded call to ${path}`);
  return (call.args.data ?? {}) as Record<string, unknown>;
}

function modelProxy(model: string): Record<string, unknown> {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, operation) {
      if (typeof operation !== "string") return undefined;
      const path = `${model}.${operation}`;
      return async (args: Record<string, unknown> = {}) => {
        calls.push({ path, args });
        const handler = handlers[path];
        if (!handler) {
          throw new Error(
            `db-mock: no handler registered for ${path}. Register one in the test.`,
          );
        }
        return handler(args);
      };
    },
  });
}

type TransactionArg =
  | ((tx: unknown) => unknown)
  | readonly unknown[];

export const fakeClient: Record<string, unknown> = new Proxy(
  {} as Record<string, unknown>,
  {
    get(_target, property) {
      // A Proxy that answers `then` with a function is a thenable, and awaiting
      // it would hang forever. Every non-string key is refused for the same
      // class of reason.
      if (typeof property !== "string" || property === "then") return undefined;

      if (property === "$transaction") {
        return async (arg: TransactionArg, options?: Record<string, unknown>) => {
          // The isolation level is recorded: settle.ts asks for Serializable,
          // and that request is the whole reason two concurrent webhook
          // deliveries cannot both pass its dedupe check.
          calls.push({ path: "$transaction", args: { options: options ?? null } });
          if (typeof arg === "function") return arg(fakeClient);
          return Promise.all(arg as readonly Promise<unknown>[]);
        };
      }

      if (property === "$queryRaw") {
        // Tagged `Prisma.sql`: the bound values are what a tenant assertion
        // needs (`values[0]` is the shopId in every raw query here).
        return async (query: { values?: unknown[] }) => {
          calls.push({ path: "$queryRaw", args: { values: query?.values ?? [] } });
          const handler = handlers["$queryRaw"];
          if (!handler) {
            throw new Error(
              "db-mock: no handler registered for $queryRaw. Register one in the test.",
            );
          }
          return handler({ values: query?.values ?? [] });
        };
      }

      return modelProxy(property);
    },
  },
);
