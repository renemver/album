const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ROOT_FOLDER = 'family-album';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── 사진 목록 조회 ────────────────────────────────────────────
// folder 파라미터 없으면 전체, 있으면 해당 연도-월 폴더만
app.get('/api/photos', async (req, res) => {
  try {
    const folder = req.query.folder
      ? `${ROOT_FOLDER}/${req.query.folder}`
      : ROOT_FOLDER;

    const result = await cloudinary.search
      .expression(`folder:${folder}/*`)
      .sort_by('created_at', 'desc')
      .max_results(500)
      .with_field('context')
      .execute();

    const photos = result.resources.map(r => ({
      public_id: r.public_id,
      url:   cloudinary.url(r.public_id, { quality: 'auto', fetch_format: 'auto', width: 1200 }),
      thumb: cloudinary.url(r.public_id, { quality: 'auto', fetch_format: 'auto', width: 400, height: 400, crop: 'fill' }),
      created_at: r.created_at,
      folder: r.folder,          // family-album/2024-03 형태
      taken_at: r.context?.custom?.taken_at || null,
    }));

    res.json({ photos });
  } catch (err) {
    console.error('사진 목록 오류:', err);
    res.status(500).json({ error: '사진 목록을 불러오지 못했어요' });
  }
});

// ── 월별 폴더 목록 ────────────────────────────────────────────
app.get('/api/folders', async (req, res) => {
  try {
    const result = await cloudinary.api.sub_folders(ROOT_FOLDER);
    // 폴더명 내림차순 정렬 (최신 월이 먼저)
    const folders = result.folders
      .map(f => f.name)
      .filter(name => /^\d{4}-\d{2}$/.test(name))
      .sort((a, b) => b.localeCompare(a));
    res.json({ folders });
  } catch (err) {
    // 서브폴더 없는 경우도 정상 처리
    res.json({ folders: [] });
  }
});

// ── 사진 업로드 ───────────────────────────────────────────────
// 클라이언트가 파일마다 taken_at(촬영일 YYYY-MM-DD) 전송
app.post('/api/photos/upload', upload.array('files'), async (req, res) => {
  try {
    // taken_at 배열: 파일 순서와 1:1 대응, JSON 문자열로 전송
    const takenAts = JSON.parse(req.body.taken_ats || '[]');

    const results = await Promise.all(
      req.files.map((file, i) => {
        const takenAt = takenAts[i] || null;         // "2024-03-15" 또는 null
        const dateStr = takenAt || new Date().toISOString().slice(0, 10);
        const yearMonth = dateStr.slice(0, 7);        // "2024-03"
        const folder = `${ROOT_FOLDER}/${yearMonth}`;

        const context = takenAt ? `taken_at=${takenAt}` : '';

        return new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder,
              resource_type: 'image',
              ...(context ? { context } : {}),
            },
            (err, result) => err ? reject(err) : resolve(result)
          ).end(file.buffer);
        });
      })
    );

    res.json({ uploaded: results.length });
  } catch (err) {
    console.error('업로드 오류:', err);
    res.status(500).json({ error: '업로드에 실패했어요' });
  }
});

// ── 사진 삭제 ─────────────────────────────────────────────────
app.delete('/api/photos/:public_id(*)', async (req, res) => {
  try {
    await cloudinary.uploader.destroy(req.params.public_id);
    res.json({ deleted: true });
  } catch (err) {
    console.error('삭제 오류:', err);
    res.status(500).json({ error: '삭제에 실패했어요' });
  }
});

// ── 서버 시작 ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
