/**
 * Nominal ("branded") types: values that share a runtime type but must never be mixed up,
 * e.g. a CustomerId passed where an EntryId is expected, or pesos passed where centavos are.
 */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };
