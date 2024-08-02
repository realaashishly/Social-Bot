import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
    {
        text: {
            type: String,
            required: false,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        links: {
            type: String,
            required: false,
        },
        linkSummary: {
            type: String,
            require: false,
        },
    },
    { timestamps: true }
);

const Event = mongoose.model("Event", eventSchema);

export default Event;
