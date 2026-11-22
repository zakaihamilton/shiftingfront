export function canSell(e: {
  class: string;
  hp: number;
  constructing: number;
  kind: string;
}): boolean {
  if (e.class !== "building" || e.hp <= 0 || e.constructing > 0) return false;
  return e.kind !== "constructionYard" && e.kind !== "objective";
}
