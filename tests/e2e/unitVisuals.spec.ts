import { expect, test } from "@playwright/test";

test("Asset Bay changes a paused tank's turret without moving its hull", async ({ page }) => {
  await page.goto("/assets");
  await page.getByRole("option", { name: "Units Tank", exact: true }).click();
  await page.getByRole("button", { name: "Pause animation", exact: true }).click();
  const canvas = page.getByRole("img", { name: "Tank preview" }).or(page.locator('canvas[aria-label="Tank preview"]'));
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete));
  const pixels = () => canvas.evaluate(element => {
    const c=element as HTMLCanvasElement,ctx=c.getContext("2d")!;
    return { upper: Array.from(ctx.getImageData(0,0,c.width,c.height-45).data), lower: Array.from(ctx.getImageData(0,c.height-45,c.width,45).data) };
  });
  // All directional layers must be loaded, including a view not used initially.
  await page.waitForFunction(async () => {
    const images=await Promise.all(["hull","turret","barrel"].map(part=>new Promise<HTMLImageElement>(resolve=>{
      const image=new Image();image.onload=()=>resolve(image);image.src=`/art/sprites/sleek-modular/animations/tank-right-${part}-v1.webp`;
    })));
    return images.every(image=>image.naturalWidth>0);
  });
  const before = await pixels();
  await page.getByText("Turret aim", { exact: true }).locator("..").getByRole("button", { name: "W", exact: true }).click();
  await expect.poll(async () => (await pixels()).upper.join(",") !== before.upper.join(",")).toBe(true);
  expect((await pixels()).lower).toEqual(before.lower);
});

test("Asset Bay exposes infantry firing and medic treatment in every direction", async ({ page }) => {
  const failures:string[]=[];
  page.on("pageerror",error=>failures.push(error.message));
  await page.goto("/assets");
  await page.getByRole("option", { name: "Units Infantry", exact: true }).click();
  await page.getByRole("button", { name: "Firing", exact: true }).click();
  for(const direction of ["E","SE","S","SW","W","NW","N","NE"]){
    await page.getByText("Facing",{exact:true}).locator("..").getByRole("button",{name:direction,exact:true}).click();
    await expect(page.locator('canvas[aria-label="Infantry preview"]')).toBeVisible();
  }
  await page.getByRole("option", { name: "Units Field Medic", exact: true }).click();
  await page.getByRole("button", { name: "Working", exact: true }).click();
  await expect(page.locator('canvas[aria-label="Field Medic preview"]')).toBeVisible();
  expect(failures).toEqual([]);
});

test("reduced-motion walking previews keep one pose throughout the gait cycle", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto("/assets");
  await page.getByRole("option", { name: "Units Infantry", exact: true }).click();
  await page.getByRole("button", { name: "Moving", exact: true }).click();
  const canvas = page.locator('canvas[aria-label="Infantry preview"]');
  await expect(canvas).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(); image.onerror = () => reject(new Error("Walk sheet failed to load"));
    image.src = "/art/sprites/sleek-modular/walk-cycle/infantry-right-walk-v1.webp";
  }));
  await page.clock.runFor(100);
  const capture = () => canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
  const before = await capture();
  // Sample transitions as well as settled frames across a complete walk cycle.
  for (let sample = 0; sample < 20; sample++) {
    await page.clock.runFor(33);
    expect(await capture()).toBe(before);
  }
});
