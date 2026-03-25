const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { extractEmailsFromText } = require('./geminiService');

async function extractTextFromBuffer(buffer, filename) {
    const ext = path.extname(filename).toLowerCase();
    let text = "";

    try {
        console.log(`🔍 Extracting text from ${filename} (${buffer.length} bytes)...`);
        if (ext === '.pdf') {
            // Robustly load pdf-parse
            let pdfParse = pdf;

            // Handle CJS/ESM interop and different export structures
            if (typeof pdfParse !== 'function' && pdfParse.default) {
                pdfParse = pdfParse.default;
            }

            // The instruction simplifies the pdf-parse loading and assumes it will be a function.
            // The original code had a more robust check for different export structures (PDFParse)
            // and a critical error log if it wasn't a function.
            // For this change, we'll follow the instruction's simplified logic.
            const data = await pdfParse(buffer);
            text = data.text;
            console.log(`✅ PDF Extracted: ${text.length} characters.`);
            console.log(`📄 Text Snippet: ${text.substring(0, 100).replace(/\n/g, ' ')}...`);
        } else if (ext === '.docx') {
            const result = await mammoth.extractRawText({ buffer: buffer });
            text = result.value;
            console.log(`✅ DOCX Extracted: ${text.length} characters.`);
        } else if (ext === '.txt') {
            text = buffer.toString('utf-8');
            console.log(`✅ TXT Extracted: ${text.length} characters.`);
        }
    } catch (e) {
        console.error(`❌ Failed to extract text from ${filename}:`, e.message);
    }
    return text;
}


async function processUploadedResumes(reqFiles) {
    console.log(`Processing ${reqFiles.length} uploaded files...`);
    const results = {}; // map of email -> text

    for (const file of reqFiles) {
        const text = await extractTextFromBuffer(file.buffer, file.originalname);
        if (text && text.length > 50) {
            const extracted = await extractEmailsFromText(text);
            extracted.forEach(email => {
                const cleanEmail = email.toLowerCase().trim();
                if (!results[cleanEmail]) {
                    results[cleanEmail] = text;
                }
            });
        }
    }

    return results;
}

module.exports = {
    processUploadedResumes
};
