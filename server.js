// server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'survey_results.db');

// --- 미들웨어 설정 ---
app.use(cors()); // 개발 중 CORS 허용
app.use(express.json()); // JSON 요청 본문 파싱
app.use(express.static(path.join(__dirname, 'public'))); // public 폴더를 정적 파일 제공 경로로 설정

// --- 데이터베이스 설정 ---
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // 테이블 초기화: 누락된 필드 (consentAgreed, quiz_q1~q7) 추가
        db.run(`CREATE TABLE IF NOT EXISTS responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            consentAgreed TEXT,             -- 동의 여부 필드 추가 (TEXT로 저장)
            gradeLevel TEXT NOT NULL,
            q1_a TEXT, q1_b TEXT, q1_c TEXT, q1_d TEXT, q1_e TEXT, q1_f TEXT,
            q2_a TEXT, q2_b TEXT, q2_c TEXT, -- Q2를 Q3 앞으로 이동하여 순서 유지
            readingDuration INTEGER,        -- finalReadingDuration 대신 사용
            quiz_q1 TEXT,                   -- 퀴즈 1번 추가
            quiz_q2 TEXT,                   -- 퀴즈 2번 추가
            quiz_q3 TEXT,                   -- 퀴즈 3번 추가
            quiz_q4 TEXT,                   -- 퀴즈 4번 추가
            quiz_q5 TEXT,                   -- 퀴즈 5번 추가
            quiz_q6 TEXT,                   -- 퀴즈 6번 추가
            quiz_q7 TEXT,                   -- 퀴즈 7번 추가
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (createErr) => {
            if (createErr) console.error('Error creating table:', createErr.message);
            else console.log('Database schema is up-to-date with all survey keys.');
        });
    }
});

// --- API 엔드포인트 ---

// 1. 설문조사 응답 제출 API
app.post('/api/submit', (req, res) => {
    const data = req.body;
    
    // q1_c (배열)은 JSON 문자열로 변환하여 저장
    const q1_c_json = JSON.stringify(data.q1_c || []);
    
    // consentAgreed는 불리언 또는 문자열이므로 TEXT로 저장 (예: 'true', 'false')
    const consentValue = data.consentAgreed ? String(data.consentAgreed) : 'false';

    const sql = `INSERT INTO responses (
        consentAgreed, gradeLevel, 
        q1_a, q1_b, q1_c, q1_d, q1_e, q1_f, 
        q2_a, q2_b, q2_c, 
        readingDuration, 
        quiz_q1, quiz_q2, quiz_q3, quiz_q4, quiz_q5, quiz_q6, quiz_q7
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [
        consentValue, data.gradeLevel, 
        data.q1_a, data.q1_b, q1_c_json, data.q1_d, data.q1_e, data.q1_f, 
        data.q2_a, data.q2_b, data.q2_c, 
        data.finalReadingDuration, // 클라이언트에서 finalReadingDuration으로 보냄
        data.quiz_q1, data.quiz_q2, data.quiz_q3, data.quiz_q4, data.quiz_q5, data.quiz_q6, data.quiz_q7
    ], function(err) {
        if (err) {
            console.error('Error inserting data:', err.message);
            return res.status(500).json({ message: "Server error during submission." });
        }
        res.status(201).json({ message: "Survey submitted successfully!", id: this.lastID });
    });
});

// 2. 결과 데이터 가져오기 API
app.get('/api/results', (req, res) => {
    const sql = "SELECT * FROM responses ORDER BY id DESC";
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Error fetching data:', err.message);
            return res.status(500).json({ message: "Server error fetching results." });
        }
        
        // JSON 문자열로 저장된 q1_c를 다시 파싱하여 배열로 변환
        const results = rows.map(row => {
            try {
                row.q1_c = JSON.parse(row.q1_c);
            } catch (e) {
                row.q1_c = []; // 파싱 오류 시 빈 배열 처리
            }
            // 동의 여부 필드를 boolean 형태로 변환하여 클라이언트에 전달 (results.html의 isConsentAgreed 함수와 연동)
            row.consentAgreed = row.consentAgreed === 'true' || row.consentAgreed === '1' || row.consentAgreed === true;
            
            // 클라이언트 HTML에서 finalReadingDuration 키를 사용하므로, 키 이름 통일
            row.finalReadingDuration = row.readingDuration;
            delete row.readingDuration; // 불필요한 키는 제거

            return row;
        });
        
        res.json(results);
    });
});

// --- 라우팅 (정적 파일 제공) ---

// 기본 경로: 설문조사 페이지 제공
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 결과 페이지 경로
app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

// --- 서버 시작 ---
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Survey Page: http://localhost:${PORT}`);
    console.log(`Results Page: http://localhost:${PORT}/results`);
});