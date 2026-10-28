const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const app = express();
const PORT = 3000;

// =====================================================
// CONFIG
// =====================================================

const STORAGE_ROOT = path.resolve(__dirname, "storage", "shared");

// Pastikan folder storage tersedia
fs.mkdirSync(STORAGE_ROOT, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Frontend
app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// SECURITY - VALIDATE PATH
// =====================================================

function getSafePath(relativePath = "") {
    // Normalisasi slash
    relativePath = relativePath.replace(/\\/g, "/");

    // Hilangkan slash di awal
    relativePath = relativePath.replace(/^\/+/, "");

    const fullPath = path.resolve(STORAGE_ROOT, relativePath);

    // Pastikan tetap berada di dalam STORAGE_ROOT
    if (
        fullPath !== STORAGE_ROOT &&
        !fullPath.startsWith(STORAGE_ROOT + path.sep)
    ) {
        throw new Error("Invalid path");
    }

    return fullPath;
}

// =====================================================
// MULTER
// =====================================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            const uploadPath = getSafePath(req.body.path || "");

            if (!fs.existsSync(uploadPath)) {
                return cb(new Error("Folder tidak ditemukan"));
            }

            const stat = fs.statSync(uploadPath);

            if (!stat.isDirectory()) {
                return cb(new Error("Path bukan folder"));
            }

            cb(null, uploadPath);
        } catch (error) {
            cb(error);
        }
    },

    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage: storage
});

// =====================================================
// GET DIRECTORY
// =====================================================

app.get("/api/files", (req, res) => {
    try {
        const relativePath = req.query.path || "";
        const directory = getSafePath(relativePath);

        if (!fs.existsSync(directory)) {
            return res.status(404).json({
                message: "Folder tidak ditemukan"
            });
        }

        const stat = fs.statSync(directory);

        if (!stat.isDirectory()) {
            return res.status(400).json({
                message: "Path bukan folder"
            });
        }

        const items = fs.readdirSync(directory, {
            withFileTypes: true
        });

        const result = items.map(item => {
            const itemPath = path.join(directory, item.name);
            const itemStat = fs.statSync(itemPath);

            return {
                name: item.name,
                type: item.isDirectory() ? "folder" : "file",
                size: item.isDirectory() ? null : itemStat.size,
                modified: itemStat.mtime
            };
        });

        // Folder di atas
        // File di bawah
        result.sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name);
            }

            return a.type === "folder" ? -1 : 1;
        });

        res.json({
            path: relativePath,
            items: result
        });

    } catch (error) {
        console.error(error);

        res.status(400).json({
            message: "Path tidak valid"
        });
    }
});

// =====================================================
// CREATE FOLDER
// =====================================================

app.post("/api/folder", (req, res) => {
    try {
        const currentPath = req.body.path || "";
        const folderName = req.body.name;

        if (!folderName) {
            return res.status(400).json({
                message: "Nama folder wajib diisi"
            });
        }

        // Jangan izinkan nama folder mengandung path
        if (
            folderName.includes("/") ||
            folderName.includes("\\") ||
            folderName === "." ||
            folderName === ".."
        ) {
            return res.status(400).json({
                message: "Nama folder tidak valid"
            });
        }

        const parentPath = getSafePath(currentPath);
        const newFolder = path.join(parentPath, folderName);

        // Pastikan hasil akhirnya aman
        getSafePath(
            path.relative(STORAGE_ROOT, newFolder)
        );

        if (fs.existsSync(newFolder)) {
            return res.status(409).json({
                message: "Folder sudah ada"
            });
        }

        fs.mkdirSync(newFolder);

        res.json({
            message: "Folder berhasil dibuat"
        });

    } catch (error) {
        console.error(error);

        res.status(400).json({
            message: error.message
        });
    }
});

// =====================================================
// UPLOAD FILE
// =====================================================

app.post("/api/upload", upload.array("files"), (req, res) => {
    res.json({
        message: "Upload berhasil",
        files: req.files.map(file => file.originalname)
    });
});

// =====================================================
// DOWNLOAD
// =====================================================

app.get("/api/download", (req, res) => {
    try {
        const relativePath = req.query.path;

        if (!relativePath) {
            return res.status(400).send("Path wajib diisi");
        }

        const filePath = getSafePath(relativePath);

        if (!fs.existsSync(filePath)) {
            return res.status(404).send("File tidak ditemukan");
        }

        const stat = fs.statSync(filePath);

        if (!stat.isFile()) {
            return res.status(400).send("Bukan file");
        }

        res.download(filePath);

    } catch (error) {
        res.status(400).send("Path tidak valid");
    }
});

// =====================================================
// DOWNLOAD MULTIPLE FILES
// =====================================================

app.post("/api/download-multiple", (req, res) => {
    try {
        const paths = req.body.paths;

        if (!Array.isArray(paths) || paths.length === 0) {
            return res.status(400).json({
                message: "Minimal satu file harus dipilih"
            });
        }

        const safeFiles = paths.map(relativePath => {
            const filePath = getSafePath(relativePath);

            if (!fs.existsSync(filePath)) {
                throw new Error(`File tidak ditemukan: ${relativePath}`);
            }

            if (!fs.statSync(filePath).isFile()) {
                throw new Error(`Bukan file: ${relativePath}`);
            }

            return {
                path: filePath,
                name: path.basename(filePath)
            };
        });

        const archiveName = `files-${Date.now()}.zip`;

        res.attachment(archiveName);

        const archive = archiver("zip", {
            zlib: { level: 9 }
        });

        archive.on("error", error => {
            console.error(error);
            if (!res.headersSent) {
                res.status(500).json({ message: "Gagal membuat ZIP" });
            } else {
                res.end();
            }
        });

        archive.pipe(res);

        safeFiles.forEach(file => {
            archive.file(file.path, { name: file.name });
        });

        archive.finalize();
    } catch (error) {
        console.error(error);
        if (!res.headersSent) {
            res.status(400).json({
                message: error.message || "Gagal membuat ZIP"
            });
        }
    }
});

// =====================================================
// DOWNLOAD FOLDER AS ZIP
// =====================================================

app.get("/api/download-folder", (req, res) => {
    try {
        const relativePath = req.query.path || "";
        const directory = getSafePath(relativePath);

        if (!fs.existsSync(directory)) {
            return res.status(404).send("Folder tidak ditemukan");
        }

        if (!fs.statSync(directory).isDirectory()) {
            return res.status(400).send("Path bukan folder");
        }

        const folderName = path.basename(directory) || "shared";
        const archiveName = `${folderName}-${Date.now()}.zip`;

        res.attachment(archiveName);

        const archive = archiver("zip", {
            zlib: { level: 9 }
        });

        archive.on("error", error => {
            console.error(error);
            if (!res.headersSent) {
                res.status(500).json({ message: "Gagal membuat ZIP" });
            } else {
                res.end();
            }
        });

        archive.pipe(res);

        // Masukkan seluruh isi folder ke root ZIP,
        // tanpa membuat folder induk tambahan.
        archive.directory(directory, false);

        archive.finalize();
    } catch (error) {
        console.error(error);
        if (!res.headersSent) {
            res.status(400).send(error.message || "Gagal membuat ZIP");
        }
    }
});

// =====================================================
// DELETE FILE / FOLDER
// =====================================================


app.delete("/api/files", (req, res) => {
    try {
        const relativePath = req.query.path;

        if (!relativePath) {
            return res.status(400).json({
                message: "Path wajib diisi"
            });
        }

        const target = getSafePath(relativePath);

        if (!fs.existsSync(target)) {
            return res.status(404).json({
                message: "File/folder tidak ditemukan"
            });
        }

        const stat = fs.statSync(target);

        if (stat.isDirectory()) {
            fs.rmSync(target, {
                recursive: true,
                force: true
            });
        } else {
            fs.unlinkSync(target);
        }

        res.json({
            message: "Berhasil dihapus"
        });

    } catch (error) {
        console.error(error);

        res.status(400).json({
            message: "Gagal menghapus"
        });
    }
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {
    console.error(error);

    res.status(400).json({
        message: error.message || "Terjadi kesalahan"
    });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log(`
========================================
 File Sharing Server
========================================

Server:
http://localhost:${PORT}

Storage:
${STORAGE_ROOT}

========================================
`);
});