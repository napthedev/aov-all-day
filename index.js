import mongoose from "mongoose";
import { spawn } from "child_process";
import dotenv from "dotenv";
import Video from "./models/Video.js";
import which from "which";
import { getVideoMeta } from "@mtatko/tiktok-scraper";

// disable console log from tiktok-scraper package
console.log = () => {};

dotenv.config();

await which("ffmpeg").catch(() => {
  console.error("Cannot find ffmpeg on your system");
  process.exit(1);
});

if (!process.env.YOUTUBE_STREAM_KEY) {
  throw new Error("Missing youtube stream key");
}

if (!process.env.MONGODB_URI) {
  throw new Error("Missing mongodb connection string");
}

await mongoose
  .connect(process.env.MONGODB_URI, { dbName: "aov-all-day" })
  .catch((err) => {
    console.error("Failed to connect to mongodb database", err);
    process.exit(1);
  });
console.info("Connected to mongodb database");

const loadVideoMp4 = async (selected, videos) => {
  const result = await Promise.allSettled(
    selected.map(async (video) => {
      const data = await getVideoMeta(video.url);
      video.mp4 = data.collector[0].videoUrl;
    })
  );
  if (selected.length === 1 && result[0].status === "rejected") {
    throw new Error();
  }

  for (const [index, item] of result.entries()) {
    if (item.status === "rejected")
      videos = videos.filter((vid) => vid.url === selected[index].url);
  }
};

let videos = (await Video.find({}, { url: true, _id: false }))
  .sort(() => 0.5 - Math.random())
  .map((item) => ({ url: item.url, mp4: null }));

let pendingVideos = [];

await loadVideoMp4(videos.slice(0, 5), videos);

let count = 0;

console.info(`Start streaming with ${videos.length} short videos`);

while (true) {
  if (count >= videos.length) {
    count = 0;
    videos = pendingVideos.length ? pendingVideos : videos;

    pendingVideos = [];
  }

  const video = videos[count++ % videos.length];

  if (count === videos.length - 5) {
    Video.find({}, { url: true, _id: false }).then((data) => {
      pendingVideos = data
        .sort(() => 0.5 - Math.random())
        .map((item) => ({ url: item.url, mp4: null }));
    });
  }

  if (!video.mp4) {
    try {
      await loadVideoMp4([video], videos);
    } catch (error) {
      continue;
    }
  }

  loadVideoMp4(videos.slice(count, count + 5), videos);

  await new Promise((resolve) => {
    spawn(
      "ffmpeg",
      [
        "-i",
        `${video.mp4}`,
        "-q:v",
        "3",
        "-vf",
        "scale=-1:720",
        "-f",
        "flv",
        `rtmp://a.rtmp.youtube.com/live2/${process.env.YOUTUBE_STREAM_KEY}`,
      ],
      {
        stdio: "ignore",
        cwd: process.cwd(),
      }
    ).on("close", resolve);
  });
}
