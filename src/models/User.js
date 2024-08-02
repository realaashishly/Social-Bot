import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        tgId: {
            type: String,
            required: true,
            unique: true,
        },
        firstname: {
            type: String,
            required: true,
        },
        lastname: {
            type: String,
            required: true,
        },
        isBot: {
            type: Boolean,
            required: true,
        },
        username: {
            type: String,
            required: true,
            unique: true,
        },
        promptToken: {
            type: Number,
            required: false,
        },
        completionToken: {
            type: Number,
            required: false,
        },
        events: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Event",
            }
        ],
    },
    { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
