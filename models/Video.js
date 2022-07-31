import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("videos", UserSchema);
