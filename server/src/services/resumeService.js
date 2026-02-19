const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { extractEmailsFromText } = require('./geminiService');

async function extractTextFromBuffer(buffer, filename) {
    const ext = path.extname(filename).toLowerCase();
    let text = "";

    try {
        if (ext === '.pdf') {
            // Robustly load pdf-parse
            let pdfParse = pdf;

            // Handle CJS/ESM interop and different export structures
            if (typeof pdfParse !== 'function') {
                if (typeof pdfParse.default === 'function') {
                    pdfParse = pdfParse.default;
                } else if (typeof pdfParse.PDFParse === 'function') {
                    pdfParse = pdfParse.PDFParse;
                }
            }

            if (typeof pdfParse === 'function') {
                const data = await pdfParse(buffer);
                text = data.text;
            } else {
                console.error("Critical: pdf-parse library could not be loaded as a function. Check node_modules.");
                console.log("Exports found:", typeof pdf === 'object' ? Object.keys(pdf) : typeof pdf);
            }
        } else if (ext === '.docx') {
            const result = await mammoth.extractRawText({ buffer: buffer });
            text = result.value;
        } else if (ext === '.txt') {
            text = buffer.toString('utf-8');
        }
    } catch (e) {
        console.error(`Failed to extract text from ${filename}:`, e.message);
    }
    return text;
}


async function processUploadedResumes(reqFiles) {
    console.log(`Processing ${reqFiles.length} uploaded files...`);
    const emails = new Set();

    for (const file of reqFiles) {
        const text = await extractTextFromBuffer(file.buffer, file.originalname);
        if (text && text.length > 50) {
            const extracted = await extractEmailsFromText(text);
            extracted.forEach(email => emails.add(email));
        }
    }

    return Array.from(emails);
}

module.exports = {
    processUploadedResumes
};
