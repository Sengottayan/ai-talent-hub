const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { optimizeResume, analyzeSkillGap, getSkillGaps, getResumeHistory, generateCoverLetter } = require('../controllers/resumeController');
const { protect } = require('../middleware/authMiddleware');

// Configure Multer for PDF/DOCX uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'temp_resumes/';
        if (!require('fs').existsSync(uploadPath)) {
            require('fs').mkdirSync(uploadPath);
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /pdf|docx/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Only .pdf and .docx files are allowed!"));
    }
});

router.post('/optimize', protect, upload.single('resume'), optimizeResume);
router.post('/skill-gap', protect, upload.single('resume'), analyzeSkillGap);
router.get('/skill-gap/history', protect, getSkillGaps);
router.get('/optimize/history', protect, getResumeHistory);
router.post('/cover-letter', protect, generateCoverLetter);

module.exports = router;
