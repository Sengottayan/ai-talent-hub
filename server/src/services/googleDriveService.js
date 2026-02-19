const { google } = require('googleapis');

function extractDriveId(url) {
    if (!url) return null;
    // Matches /folders/ID or id=ID
    const patterns = [
        /\/folders\/([a-zA-Z0-9-_]+)/,
        /id=([a-zA-Z0-9-_]+)/,
        /^([a-zA-Z0-9-_]+)$/ // If they just paste the ID
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

async function listFiles(folderId) {
    // If no folderId provided, try env, else fail.
    const targetId = folderId || process.env.DRIVE_FOLDER_ID;

    if (!targetId) {
        console.warn("⚠️ No Drive Folder ID provided.");
        return [];
    }

    // Authenticate: specific credentials > GEMINI_API_KEY (fallback for public public folders)
    let authClient = null;
    if (process.env.GDRIVE_CREDENTIALS) {
        authClient = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GDRIVE_CREDENTIALS),
            scopes: ["https://www.googleapis.com/auth/drive.readonly"]
        });
    } else if (process.env.GEMINI_API_KEY) {
        console.log("Using API Key for Drive (Public Access Only)");
        authClient = process.env.GEMINI_API_KEY;
    } else {
        console.warn("⚠️ No Creds or API Key found. Drive disabled.");
        return [];
    }

    try {
        const drive = google.drive({ version: "v3", auth: authClient });

        const files = await drive.files.list({
            q: `'${targetId}' in parents and trashed = false`,
            fields: "files(id, name)"
        });

        if (!files.data.files || files.data.files.length === 0) {
            return [];
        }

        return files.data.files;
    } catch (error) {
        console.error("Error listing Drive files:", error.message);
        return [];
    }
}

async function getFileBuffer(fileId) {
    let authClient = null;
    if (process.env.GDRIVE_CREDENTIALS) {
        authClient = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GDRIVE_CREDENTIALS),
            scopes: ["https://www.googleapis.com/auth/drive.readonly"]
        });
    } else if (process.env.GEMINI_API_KEY) {
        authClient = process.env.GEMINI_API_KEY;
    } else {
        return null;
    }

    try {
        const drive = google.drive({ version: "v3", auth: authClient });

        const res = await drive.files.get(
            { fileId: fileId, alt: "media" },
            { responseType: "arraybuffer" }
        );
        return Buffer.from(res.data);
    } catch (error) {
        console.error(`Error fetching file buffer ${fileId}:`, error.message);
        return null;
    }
}

module.exports = { listFiles, getFileBuffer, extractDriveId };
