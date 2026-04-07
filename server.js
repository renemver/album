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
app.get('/api/photos', async (req, res) => {
  try {
    const folder = req.query.folder
      ? `${ROOT_FOLDER}/${req.query.folder}`
      : ROOT_FOLDER;

    console.log(`[photos] 조회 folder: ${folder}`);

    const result = await cloudinary.search
      .expression(`folder:${folder}/*`)
      .sort_by('created_at', 'desc')
      .max_results(500)
      .with_field('context')
      .execute();

    console.log(`[photos] 결과: ${result.resources.length}장`);

    const photos = result.resources.map(r => ({
      public_id: r.public_id,
      url:   cloudinary.url(r.public_id, { quality: 'auto', fetch_format: 'auto', width: 1200 }),
      thumb: cloudinary.url(r.public_id, { quality: 'auto', fetch_format: 'auto', width: 400, height: 400, crop: 'fill' }),
      created_at: r.created_at,
      folder: r.folder,
      taken_at: r.context?.custom?.taken_at || null,
    }));

    res.json({ photos });
  } catch (err) {
    console.error('[photos] 오류:', err.message);
    res.status(500).json({ error: '사진 목록을 불러오지 못했어요' });
  }
});

// ── 월별 폴더 목록 ────────────────────────────────────────────
app.get('/api/folders', async (req, res) => {
  try {
    const result = await cloudinary.api.sub_folders(ROOT_FOLDER);
    console.log(`[folders] 서브폴더:`, result.folders.map(f => f.name));
    const folders = result.folders
      .map(f => f.name)
      .filter(name => /^\d{4}-\d{2}$/.test(name))
      .sort((a, b) => b.localeCompare(a));
    res.json({ folders });
  } catch (err) {
    console.error('[folders] 오류:', err.message);
    res.json({ folders: [] });
  }
});

// ── 사진 업로드 ───────────────────────────────────────────────
app.post('/api/photos/upload', upload.array('files'), async (req, res) => {
  try {
    console.log(`[upload] 파일 수: ${req.files?.length}`);
    console.log(`[upload] taken_ats raw:`, req.body.taken_ats);

    const takenAts = JSON.parse(req.body.taken_ats || '[]');
    console.log(`[upload] taken_ats 파싱:`, takenAts);

    const results = await Promise.all(
      req.files.map((file, i) => {
        const takenAt = takenAts[i] || null;
        const dateStr = takenAt || new Date().toISOString().slice(0, 10);
        const yearMonth = dateStr.slice(0, 7);
        const folder = `${ROOT_FOLDER}/${yearMonth}`;

        console.log(`[upload] 파일 ${i}: takenAt=${takenAt}, folder=${folder}`);

        const uploadOptions = {
          folder,
          resource_type: 'image',
        };
        if (takenAt) {
          uploadOptions.context = `taken_at=${takenAt}`;
        }

        return new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            uploadOptions,
            (err, result) => {
              if (err) {
                console.error(`[upload] 파일 ${i} 실패:`, err.message);
                reject(err);
              } else {
                console.log(`[upload] 파일 ${i} 성공: ${result.public_id}`);
                resolve(result);
              }
            }
          ).end(file.buffer);
        });
      })
    );

    console.log(`[upload] 완료: ${results.length}장`);
    res.json({ uploaded: results.length });
  } catch (err) {
    console.error('[upload] 오류:', err.message);
    res.status(500).json({ error: '업로드에 실패했어요' });
  }
});

// ── 사진 삭제 ─────────────────────────────────────────────────
app.delete('/api/photos/:public_id(*)', async (req, res) => {
  try {
    const public_id = req.params.public_id;
    console.log(`[delete] public_id: ${public_id}`);
    await cloudinary.uploader.destroy(public_id);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[delete] 오류:', err.message);
    res.status(500).json({ error: '삭제에 실패했어요' });
  }
});

// ── 서버 시작 ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
