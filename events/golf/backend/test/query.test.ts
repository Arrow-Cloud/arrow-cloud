import { parseIdFilter } from '../src/query';

describe('parseIdFilter', () => {
  it('is undefined when the parameter is absent - no filter at all', () => {
    expect(parseIdFilter(undefined)).toBeUndefined();
  });

  // The regression. `?userIds=` is a filter that matches nobody, not "no filter": a rivals-only view for a
  // player with no rivals sends exactly this. It used to be tested with `raw ? ... : undefined`, and the empty
  // string is falsy, so that player was shown everyone's activity.
  it('is an EMPTY SET - not undefined - when the parameter is present but empty', () => {
    const filter = parseIdFilter('');
    expect(filter).toBeInstanceOf(Set);
    expect(filter!.size).toBe(0);
  });

  it.each([[','], [',,'], [' , '], ['  ']])('is an empty set for %p, which names nobody', (raw) => {
    expect(parseIdFilter(raw)?.size).toBe(0);
  });

  it('parses a list', () => {
    expect([...parseIdFilter('a,b,c')!]).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace and drops empty entries', () => {
    expect([...parseIdFilter(' a , , b ,')!]).toEqual(['a', 'b']);
  });

  it('de-duplicates', () => {
    expect([...parseIdFilter('a,b,a,a')!]).toEqual(['a', 'b']);
  });
});
