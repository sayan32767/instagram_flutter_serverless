import express from "express";
import admin from "firebase-admin";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(
            JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        ),
    });
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

app.post("/send-dm-push", async (req, res) => {
    const { receiverId, title, body } = req.body;

    try {
        if (!receiverId || !title || !body) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        // 1️⃣ Fetch receiver FCM token
        const userDoc = await admin.firestore()
            .collection("users_private")
            .doc(receiverId)
            .get();

        const tokens = userDoc.data().fcmTokens;

        if (!tokens || tokens.length === 0) return res.status(400).json({ success: false, error: "Receiver has no FCM token" });

        // 2️⃣ Send push
        const response = await admin.messaging().sendEachForMulticast({
            tokens: tokens,
            notification: {
                title: title,
                body: body,
            },
            android: {
                notification: {
                    channelId: "high_importance_channel_v4",
                    sound: "default",
                    icon: "ic_stat_instagram",
                }
            },
            data: {
                type: "dm",
                receiverId: receiverId,
            }
        });

        // 3️⃣ Handle invalid tokens
        const invalidTokens = [];

        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const errorCode = resp.error.code;

                if (
                    errorCode === "messaging/invalid-registration-token" ||
                    errorCode === "messaging/registration-token-not-registered"
                ) {
                    invalidTokens.push(tokens[idx]);
                }
            }
        });

        if (invalidTokens.length > 0) {
            await admin.firestore()
                .collection("users_private")
                .doc(receiverId)
                .update({
                    fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens)
                });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, error });
    }
});
