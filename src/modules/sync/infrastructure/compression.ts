/** gzip via the platform's CompressionStream (browsers and Node 18+). Ledger JSON shrinks ~5×. */
async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export const gzip = (bytes: Uint8Array<ArrayBuffer>) => pipe(bytes, new CompressionStream("gzip"));
export const gunzip = (bytes: Uint8Array<ArrayBuffer>) => pipe(bytes, new DecompressionStream("gzip"));
