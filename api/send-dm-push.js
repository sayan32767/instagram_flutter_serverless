import admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(
            JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        ),
    });
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { receiverId, title, body } = req.body;

    if (!receiverId || !title || !body) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    try {
        const userDoc = await admin
            .firestore()
            .collection("users_private")
            .doc(receiverId)
            .get();

        const tokens = userDoc.data()?.fcmTokens;

        if (!tokens?.length) {
            return res.status(400).json({ error: "No tokens found" });
        }

        // await admin.messaging().sendEachForMulticast({
        //     tokens,
        //     notification: { title, body },
        // });

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

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, error: error.message || "Internal Server Error" });
    }

    return res.status(200).json({ success: true });
}