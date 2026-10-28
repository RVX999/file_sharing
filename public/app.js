function fileManager() {
    return {
        currentPath: "",
        items: [],
        selectedFiles: [],
        loading: false,

        get pathParts() {
            return this.currentPath
                ? this.currentPath.split("/").filter(Boolean)
                : [];
        },

        async loadFiles(path = "") {
            this.currentPath = path;
            this.loading = true;
            this.selectedFiles = [];

            try {
                const response = await fetch(
                    `/api/files?path=${encodeURIComponent(path)}`
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || "Gagal memuat folder");
                }

                this.items = data.items;
            } catch (error) {
                alert(error.message);
            } finally {
                this.loading = false;
            }
        },

        openItem(item) {
            if (item.type !== "folder") return;

            this.loadFiles(this.joinPath(this.currentPath, item.name));
        },

        isSelected(name) {
            return this.selectedFiles.includes(name);
        },

        toggleSelected(name) {
            if (this.isSelected(name)) {
                this.selectedFiles = this.selectedFiles.filter(
                    file => file !== name
                );
            } else {
                this.selectedFiles.push(name);
            }
        },

        clearSelection() {
            this.selectedFiles = [];
        },

        downloadFile(name) {
            const filePath = this.joinPath(this.currentPath, name);

            window.location.href =
                `/api/download?path=${encodeURIComponent(filePath)}`;
        },

        async downloadSelected() {
            if (!this.selectedFiles.length) {
                alert("Pilih minimal satu file.");
                return;
            }

            const paths = this.selectedFiles.map(name =>
                this.joinPath(this.currentPath, name)
            );

            await this.downloadZip(paths);
        },

        async downloadZip(paths) {
            this.loading = true;

            try {
                const response = await fetch("/api/download-multiple", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ paths })
                });

                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.message || "Gagal membuat ZIP");
                }

                const blob = await response.blob();

                this.saveBlob(blob, "files.zip");
                this.clearSelection();
            } catch (error) {
                alert(error.message);
            } finally {
                this.loading = false;
            }
        },

        downloadFolder(folderName = null) {
            const targetPath = folderName
                ? this.joinPath(this.currentPath, folderName)
                : this.currentPath;

            if (!targetPath) {
                alert("Pilih folder terlebih dahulu.");
                return;
            }

            window.location.href =
                `/api/download-folder?path=${encodeURIComponent(targetPath)}`;
        },

        async uploadFiles(event) {
            const files = event.target.files;

            if (!files.length) return;

            const formData = new FormData();
            formData.append("path", this.currentPath);

            for (const file of files) {
                formData.append("files", file);
            }

            this.loading = true;

            try {
                const response = await fetch("/api/upload", {
                    method: "POST",
                    body: formData
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || "Upload gagal");
                }

                alert("Upload berhasil");
                event.target.value = "";
                await this.loadFiles(this.currentPath);
            } catch (error) {
                alert(error.message);
                event.target.value = "";
            } finally {
                this.loading = false;
            }
        },

        async createFolder() {
            const name = prompt("Masukkan nama folder:");

            if (!name) return;

            try {
                const response = await fetch("/api/folder", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        path: this.currentPath,
                        name
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || "Gagal membuat folder");
                }

                await this.loadFiles(this.currentPath);
            } catch (error) {
                alert(error.message);
            }
        },

        async deleteItem(name) {
            if (!confirm(`Hapus "${name}"?`)) return;

            const itemPath = this.joinPath(this.currentPath, name);

            try {
                const response = await fetch(
                    `/api/files?path=${encodeURIComponent(itemPath)}`,
                    { method: "DELETE" }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || "Gagal menghapus");
                }

                this.selectedFiles = this.selectedFiles.filter(
                    file => file !== name
                );

                await this.loadFiles(this.currentPath);
            } catch (error) {
                alert(error.message);
            }
        },

        joinPath(parent, child) {
            return parent ? `${parent}/${child}` : child;
        },

        saveBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = filename;

            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(() => URL.revokeObjectURL(url), 1000);
        },

        formatBytes(bytes) {
            if (bytes === 0) return "0 B";

            const units = ["B", "KB", "MB", "GB", "TB"];
            const index = Math.floor(
                Math.log(bytes) / Math.log(1024)
            );

            return `${parseFloat(
                (bytes / Math.pow(1024, index)).toFixed(2)
            )} ${units[index]}`;
        },

        formatDate(value) {
            return new Date(value).toLocaleString("id-ID");
        },

        getFileIcon(filename, type) {
            if (type === "folder") return "📁";

            const ext = filename.split(".").pop().toLowerCase();

            const icons = {
                pdf: "📕",
                doc: "📘",
                docx: "📘",
                xls: "📗",
                xlsx: "📗",
                ppt: "📙",
                pptx: "📙",
                zip: "📦",
                rar: "📦",
                "7z": "📦",
                jpg: "🖼️",
                jpeg: "🖼️",
                png: "🖼️",
                gif: "🖼️",
                webp: "🖼️",
                mp3: "🎵",
                wav: "🎵",
                mp4: "🎬",
                mkv: "🎬",
                txt: "📄",
                js: "📜",
                html: "📜",
                css: "📜",
                php: "📜",
                json: "📜"
            };

            return icons[ext] || "📄";
        }
    };
}
