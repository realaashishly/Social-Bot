import { Telegraf } from "telegraf";
import OpenAI from "openai";
import { message } from "telegraf/filters";
import User from "./src/models/User.js";
import connectDB from "./src/config/db.js";
import Event from "./src/models/Event.js";
import { YoutubeTranscript } from "youtube-transcript";
import "dotenv/config";

// Initialize bot with API key
const bot = new Telegraf(process.env.TELEGRAM_BOT_API);
const openai = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
});

// Connect to the database
connectDB();

bot.start(async (ctx) => {
    const from = ctx.message.from;

    const existingUser = User.findOne({ tgId: from.id });

    if (existingUser) {
        try {
            // Find or create a user in the database
            await User.findOneAndUpdate(
                { tgId: from.id },
                {
                    $setOnInsert: {
                        firstname: from.first_name,
                        lastname: from.last_name,
                        username: from.username,
                        isBot: from.is_bot,
                    },
                },
                { upsert: true, new: true }
            );

            // Send welcome message
            return await ctx.reply(
                `Hey ${from.first_name}, Welcome. I will be writing highly engaging social media posts for you 🚀 Just keep feeding me with the events throughout the day. Let's shine on social media ✨`
            );
        } catch (error) {
            console.error("Error handling start command: ", error);
            await ctx.reply("Facing some difficulties!");
            process.exit(0);
        }
    }

    try {
        const newUser = new User({
            tgId: from.id,
            firstname: from.first_name,
            lastname: from.last_name,
            username: from.username,
            isBot: from.is_bot,
        });

        return await ctx.reply(
            `Hey ${from.first_name}, Welcome. I will be writing highly engaging social media posts for you 🚀 Just keep feeding me with the events throughout the day. Let's shine on social media ✨`
        );
    } catch (error) {
        console.error("Error while creating user: ", error.message);
        await ctx.reply("Facing some issues! Please try again");
        process.exit(0);
    }
});

bot.command("generate", async (ctx) => {
    const from = ctx.update.message.from;

    const waitingMessage = `Hey! ${from.first_name}, kindly wait for a moment. I am curating a post for you 🚀⌛`;
    const loadingSticker =
        "CAACAgIAAxkBAAMSZlta8V27fLEHdVkZwWzUaO2WHA4AAkoDAAK1cdoGwn4G-ptIHsQ1BA";

    const { message_id: waitingMessageId } = await ctx.reply(waitingMessage);
    const { message_id: loadingStickerId } = await ctx.replyWithSticker(
        loadingSticker
    );

    try {
        const user = await User.findOne({ tgId: from.id });

        if (!user) {
            await ctx.reply(
                "User not found. Please restart the bot with /start."
            );
            throw new Error("User not found");
        }

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const events = await Event.find({
            userId: user._id,
        });

        console.log(events);

        const lastEvent = events.length > 0 ? events[events.length - 1] : null;

        if (events.length === 0) {
            await ctx.deleteMessage(waitingMessageId);
            await ctx.deleteMessage(loadingStickerId);
            await ctx.reply("No events for the day.");
            return;
        }

        const eventTexts = events.map((event) => event.text).join(", ");

        const chatCompletion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: [
                {
                    role: "system",
                    content:
                        "Act as a senior copywriter, you write highly engaging posts for LinkedIn, Facebook, and Twitter using provided thoughts/events throughout the day.",
                },
                {
                    role: "user",
                    content: `Write like a human, for humans. Craft three engaging social media posts tailored for LinkedIn, Facebook, and Twitter audiences. Use simple language. Use given time labels just to understand the order of the event, don't mention the time in the posts. Each post should creatively highlight the following events. Ensure the tone is conversational and impactful. Focus on engaging the respective platform's audience, encouraging interaction, and driving interest in the events: ${lastEvent}`,
                },
            ],
        });

        await User.findOneAndUpdate(
            { tgId: from.id },
            {
                $inc: {
                    promptToken: chatCompletion.usage.prompt_tokens,
                    completionToken: chatCompletion.usage.completion_tokens,
                },
            }
        );

        await ctx.deleteMessage(waitingMessageId);
        await ctx.deleteMessage(loadingStickerId);
        await ctx.reply(chatCompletion.choices[0].message.content);
    } catch (error) {
        console.error("Error creating event: ", error);
        await ctx.deleteMessage(waitingMessageId);
        await ctx.deleteMessage(loadingStickerId);
        await ctx.reply("Facing some difficulties!");
    }
});

const handleUrl = async (ctx) => {
    const from = ctx.update.message.from;
    const link = ctx.update.message.text;

    const { message_id: loadingStickerId } = await ctx.replyWithSticker(
        "CAACAgIAAxkBAAPBZmvkquSdnsOtpA1sH1QaN_idVa4AAiMAAygPahQnUSXnjCCkBjUE"
    );

    try {
        const transcript = await YoutubeTranscript.fetchTranscript(link); // Assuming fetchTranscript is the correct method
        const transcriptText = transcript.map((item) => item.text).join(" ");

        const videoSummaryResponse = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: [
                {
                    role: "system",
                    content:
                        "You have to summarize a YouTube video using its transcript in 10 points",
                },
                { role: "user", content: transcriptText },
            ],
        });

        const videoSummary = videoSummaryResponse.choices[0].message.content;

        const user = await User.findOne({ tgId: from.id }).populate("events");

        if (!user) {
            await ctx.reply(
                "Please restart the bot with /start then paste the link again."
            );
            throw new Error("User not found");
        }

        const event = new Event({
            links: link,
            linkSummary: videoSummary,
            userId: user._id,
        });

        user.events.push(event._id);

        await Promise.all([event.save(), user.save()]);

        await ctx.deleteMessage(loadingStickerId);
        await ctx.reply(videoSummary);
    } catch (error) {
        await ctx.deleteMessage(loadingStickerId);

        if (error.message.includes("Transcript is not available")) {
            await ctx.reply("No Subtitles found");
        } else if (error.message.includes("Invalid video ID")) {
            await ctx.reply("Invalid Video Link");
        } else {
            console.error(error);
            await ctx.reply("Unable to Summarize the video");
        }
    }
};

bot.url(handleUrl);

bot.on(message("text"), async (ctx) => {
    const from = ctx.update.message.from;
    const message = ctx.update.message.text;

    ctx.reply("We're currently working on our text messaging service. Apologies for any inconvenience.")
    ctx.replyWithSticker("CAACAgIAAxkBAAIBXWZsWd27ZG4GEu6IvwABFHDUQDDzmQACIgEAAjDUnRFFom0FAXPdVjUE");

    // try {
    //     const user = await User.findOne({ tgId: from.id });
    //     if (!user) {
    //         return ctx.reply("Please start the bot first");
    //     }

    //     const event = await Event.create({
    //         text: message,
    //         userId: user._id,
    //     });

    //     user.events.push(event._id);
    //     await user.save();

    //     await ctx.reply(
    //         "Noted 👍, Keep texting me your thoughts. To generate the posts, just enter the command: /generate"
    //     );
    // } catch (error) {
    //     console.error("Error creating event: ", error);
    //     await ctx.reply("Facing some difficulties!");
    // }
});

bot.on(message("sticker"), async (ctx) => {
    console.log(ctx.update.message);
});

// Launch the bot
bot.launch();

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
