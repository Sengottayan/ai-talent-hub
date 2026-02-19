require('dotenv').config();
const Retell = require('retell-sdk');

console.log("Retell imported:", Retell);

try {
    const retell = new Retell({
        apiKey: process.env.RETELL_API_KEY,
    });
    console.log("Retell client initialized:", retell);

    // Test call creation (mocking API key logic if needed, but let's try real call)
    // Note: This will create a real call if successful, which is fine for debugging.
    const agentId = process.env.RETELL_AGENT_ID;
    console.log("Agent ID:", agentId);

    if (!agentId) {
        console.error("No Agent ID found!");
        process.exit(1);
    }

    retell.call.createWebCall({
        agent_id: agentId,
    })
        .then(response => {
            console.log("Success:", response);
        })
        .catch(error => {
            console.error("Error calling Retell:", error);
            if (error.response) {
                console.error("Response data:", error.response.data);
            }
        });

} catch (err) {
    console.error("Initialization Error:", err);
}
