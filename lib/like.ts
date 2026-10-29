// For .ilike(): "%" and "_" are wildcards, so an email like a_b@x.com would also match axb@x.com. This makes
// the match exact (still case-insensitive).
export const exactly = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
