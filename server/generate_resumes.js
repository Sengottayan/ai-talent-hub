
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun } = require('docx');

const TEMP_DIR = path.join(__dirname, 'temp_resumes');

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Data for candidates
const candidates = [
    // 1-5: Matches (Python, Data Analyst, Exp 2+)
    { name: "Alice Smith", role: "Data Analyst", skills: ["Python", "SQL", "Tableau"], exp: 3, type: 'pdf' },
    { name: "Bob Johnson", role: "Data Analyst", skills: ["Python", "Excel", "PowerBI"], exp: 4, type: 'docx' },
    { name: "Charlie Brown", role: "Data Analyst", skills: ["Python", "Machine Learning"], exp: 2.5, type: 'txt' },
    { name: "Diana Prince", role: "Senior Analyst", skills: ["Python", "R", "SQL"], exp: 5, type: 'pdf' },
    { name: "Evan Wright", role: "Data Scientist", skills: ["Python", "Deep Learning"], exp: 3, type: 'docx' },

    // 6-10: Mismatched Skills (Java, Web Dev)
    { name: "Frank Miller", role: "Web Developer", skills: ["Java", "Spring", "React"], exp: 4, type: 'pdf' },
    { name: "Grace Hopper", role: "Backend Engineer", skills: ["Java", "Kotlin"], exp: 6, type: 'docx' },
    { name: "Hank Pym", role: "Android Dev", skills: ["Java", "Android Studio"], exp: 3, type: 'txt' },
    { name: "Ivy Doom", role: "HR Manager", skills: ["Recruiting", "Communication"], exp: 10, type: 'pdf' },
    { name: "Jack Black", role: "Sales", skills: ["Negotiation", "CRM"], exp: 2, type: 'docx' },

    // 11-15: Low Experience / Partial Match
    { name: "Karen Page", role: "Junior Analyst", skills: ["Python"], exp: 0.5, type: 'pdf' }, // Might fail exp check (minExp usually 0 or 1, user set 0 in previous request? let's see. If minExp is 0, this might pass.)
    { name: "Leo Fitz", role: "Intern", skills: ["Python"], exp: 0.1, type: 'docx' },
    { name: "Mindy Lahiri", role: "Doctor", skills: ["Medicine"], exp: 7, type: 'txt' },
    { name: "Nate Archibald", role: "Student", skills: ["C++"], exp: 0, type: 'pdf' },
    { name: "Olivia Pope", role: "Fixer", skills: ["Management"], exp: 8, type: 'docx' }
];

async function createPDF(candidate, filename) {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(filename));

    doc.fontSize(20).text(candidate.name, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Role: ${candidate.role}`);
    doc.text(`Email: ${candidate.name.split(' ')[0].toLowerCase()}@example.com`);
    doc.text(`Phone: 555-0100`);
    doc.moveDown();
    doc.text(`Experience: ${candidate.exp} years`); // "total_experience" parser usually looks for numbers + "years"
    doc.moveDown();
    doc.text("Skills:");
    candidate.skills.forEach(s => doc.text(`- ${s}`));

    doc.end();
}

async function createDocx(candidate, filename) {
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({ children: [new TextRun({ text: candidate.name, bold: true, size: 40 })] }),
                new Paragraph({ children: [new TextRun(`Role: ${candidate.role}`)] }),
                new Paragraph({ children: [new TextRun(`Email: ${candidate.name.split(' ')[0].toLowerCase()}@example.com`)] }),
                new Paragraph({ children: [new TextRun(`Phone: 555-0100`)] }),
                new Paragraph({ children: [new TextRun(`Experience: ${candidate.exp} years`)] }),
                new Paragraph({ children: [new TextRun("Skills:")] }),
                ...candidate.skills.map(s => new Paragraph({ children: [new TextRun(`- ${s}`)] }))
            ],
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filename, buffer);
}

function createTxt(candidate, filename) {
    const content = `
${candidate.name}
Role: ${candidate.role}
Email: ${candidate.name.split(' ')[0].toLowerCase()}@example.com
Phone: 555-0100

Experience: ${candidate.exp} years

Skills:
${candidate.skills.map(s => `- ${s}`).join('\n')}
    `;
    fs.writeFileSync(filename, content);
}

async function generate() {
    console.log("Generating 15 resumes...");

    for (const [i, candidate] of candidates.entries()) {
        const ext = candidate.type;
        const filename = path.join(TEMP_DIR, `Resume_${i + 1}_${candidate.name.replace(' ', '_')}.${ext}`);

        try {
            if (ext === 'pdf') await createPDF(candidate, filename);
            else if (ext === 'docx') await createDocx(candidate, filename);
            else createTxt(candidate, filename);

            console.log(`Created ${filename}`);
        } catch (err) {
            console.error(`Failed to create ${filename}:`, err);
        }
    }
    console.log("Done.");
}

generate();
