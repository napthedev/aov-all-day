import dotenv from "dotenv";
import mongoose from "mongoose";
import { launch } from "puppeteer";
import CaptchaSolver from "tiktok-captcha-solver";
import User from "./models/User.js";
import Video from "./models/Video.js";
import { splitArray } from "./shared/utils.js";

dotenv.config();

console.time("Done updating data after");

await mongoose
  .connect(process.env.MONGODB_URI, { dbName: "aov-all-day" })
  .catch((err) => {
    console.error("Failed to connect to mongodb database", err);
    process.exit(1);
  });
console.log("Connected to mongodb database");

const users = (await User.find()).map((user) => user.username);

const browser = await launch();

const result = [];

const page = await browser.newPage();

const captchaSolver = new CaptchaSolver(page);

await page.goto("https://www.tiktok.com/@tiktok");

await captchaSolver.solve();

await page.close();

for (const group of splitArray(users, 10)) {
  await Promise.all(
    group.map(async (user) => {
      let page;
      try {
        page = await browser.newPage();

        const captchaSolver = new CaptchaSolver(page);

        await page.goto(`https://www.tiktok.com/@${user}`, {
          waitUntil: "domcontentloaded",
        });

        if (
          await page.evaluate(() =>
            document
              .querySelector("html")
              .innerHTML.toLowerCase()
              .includes("ttgcaptcha")
          )
        )
          await captchaSolver.solve();

        let links = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(
              `[data-e2e="user-post-item-list"] [data-e2e="user-post-item"] a`
            )
          ).map((el) => el.getAttribute("href"))
        );

        if (links.length === 0) {
          // Reload page and try one more time
          await page.reload({ waitUntil: "domcontentloaded" });

          if (
            await page.evaluate(() =>
              document
                .querySelector("html")
                .innerHTML.toLowerCase()
                .includes("ttgcaptcha")
            )
          )
            await captchaSolver.solve();

          links = await page.evaluate(() =>
            Array.from(
              document.querySelectorAll(
                `[data-e2e="user-post-item-list"] [data-e2e="user-post-item"] a`
              )
            ).map((el) => el.getAttribute("href"))
          );
          if (links.length === 0) throw new Error("Cannot find any video");
        }

        result.push(...links);
        console.log(`User @${user} got ${links.length} videos`);
      } catch (error) {
        console.log(`User @${user} failed`);
      } finally {
        await page?.close();
      }
    })
  );
}

await Video.bulkWrite(
  result.map((link) => ({
    updateOne: {
      filter: { url: link },
      update: {
        $set: {
          url: link,
          updatedAt: Date.now(),
        },
      },
      upsert: true,
    },
  }))
);

await browser.close();

console.timeEnd("Done updating data after");

await mongoose.disconnect();
