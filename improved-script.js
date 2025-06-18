// 顔と名前記録アプリ - メインスクリプト

class FaceRecognitionApp {
    constructor() {
        this.modelsLoaded = false;
        this.modelType = null;
        this.currentImage = null;
        this.detectedFaces = [];
        this.isManualMode = false;
        this.initializeApp();
    }

    async initializeApp() {
        this.setupEventListeners();
        await this.loadModels();
        this.loadSavedFaces();
    }

    setupEventListeners() {
        // タブ切り替え
        document.getElementById('upload-tab').addEventListener('click', () => this.showSection('upload'));
        document.getElementById('list-tab').addEventListener('click', () => this.showSection('list'));

        // ファイルアップロード
        document.getElementById('file-button').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        document.getElementById('file-input').addEventListener('change', (e) => this.handleFileUpload(e));

        // カメラ撮影
        document.getElementById('camera-button').addEventListener('click', () => this.startCamera());
        document.getElementById('capture-button').addEventListener('click', () => this.capturePhoto());
        document.getElementById('cancel-button').addEventListener('click', () => this.stopCamera());

        // 顔検出
        document.getElementById('detect-faces-button').addEventListener('click', () => this.detectFaces());
        document.getElementById('toggle-preview-button').addEventListener('click', () => this.togglePreview());

        // 設定
        document.getElementById('confidence-slider').addEventListener('input', (e) => {
            document.getElementById('confidence-value').textContent = e.target.value;
        });

        // 保存・削除
        document.getElementById('save-all-button').addEventListener('click', () => this.saveAllFaces());
        document.getElementById('clear-all-button').addEventListener('click', () => this.clearAllFaces());
    }

    async loadModels() {
        try {
            this.showMessage('Face-APIモデルを読み込み中...', 'loading');
            
            // 軽量モデルから試行
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'),
                faceapi.nets.faceLandmark68TinyNet.loadFromUri('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'),
                faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights')
            ]);
            
            this.modelsLoaded = true;
            this.modelType = 'tiny';
            this.showMessage('軽量モデルの読み込みが完了しました', 'success');
            console.log('Face-API tiny models loaded successfully');
        } catch (error) {
            console.warn('Tiny models failed, trying standard models:', error);
            // フォールバック: 標準モデルを試行
            try {
                this.showMessage('標準モデルを読み込み中...', 'loading');
                
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'),
                    faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'),
                    faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights')
                ]);
                
                this.modelsLoaded = true;
                this.modelType = 'standard';
                this.showMessage('標準モデルの読み込みが完了しました', 'success');
                console.log('Face-API standard models loaded successfully');
            } catch (standardError) {
                console.warn('Standard models also failed:', standardError);
                // 最終フォールバック: GitHubから試行
                try {
                    this.showMessage('代替CDNから読み込み中...', 'loading');
                    const altModelUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
                    
                    await Promise.all([
                        faceapi.nets.tinyFaceDetector.loadFromUri(altModelUrl),
                        faceapi.nets.faceLandmark68TinyNet.loadFromUri(altModelUrl),
                        faceapi.nets.faceRecognitionNet.loadFromUri(altModelUrl)
                    ]);
                    
                    this.modelsLoaded = true;
                    this.modelType = 'tiny';
                    this.showMessage('代替CDNからの読み込みが完了しました', 'success');
                    console.log('Face-API models loaded from GitHub');
                } catch (altError) {
                    console.warn('All model loading attempts failed:', altError);
                    this.showManualModeNotice();
                }
            }
        }
    }

    showManualModeNotice() {
        this.isManualMode = true;
        const notice = document.createElement('div');
        notice.className = 'manual-mode-notice';
        notice.innerHTML = `
            <p>自動顔検出モデルの読み込みに失敗しました</p>
            <p>手動モードで顔領域を選択してください</p>
            <button class="manual-mode-btn" onclick="app.enableManualSelection()">手動選択モードを有効にする</button>
        `;
        
        const imageArea = document.getElementById('image-area');
        imageArea.insertBefore(notice, imageArea.firstChild);
        
        // 検出ボタンのテキストを変更
        document.getElementById('detect-faces-button').textContent = '手動で顔を選択';
    }

    enableManualSelection() {
        const canvas = document.getElementById('preview-canvas');
        const img = document.getElementById('uploaded-image');
        
        if (!img.src) {
            this.showMessage('まず画像をアップロードしてください', 'error');
            return;
        }

        // キャンバスをセットアップ
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.style.display = 'block';
        canvas.style.width = img.clientWidth + 'px';
        canvas.style.height = img.clientHeight + 'px';

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        let isDrawing = false;
        let startX, startY, currentRect = null;

        const getMousePos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        };

        canvas.addEventListener('mousedown', (e) => {
            const pos = getMousePos(e);
            isDrawing = true;
            startX = pos.x;
            startY = pos.y;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;
            
            const pos = getMousePos(e);
            const width = pos.x - startX;
            const height = pos.y - startY;

            // キャンバスをクリアして画像を再描画
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            // 選択範囲を描画
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 3;
            ctx.strokeRect(startX, startY, width, height);
        });

        canvas.addEventListener('mouseup', (e) => {
            if (!isDrawing) return;
            isDrawing = false;

            const pos = getMousePos(e);
            const width = Math.abs(pos.x - startX);
            const height = Math.abs(pos.y - startY);
            const x = Math.min(startX, pos.x);
            const y = Math.min(startY, pos.y);

            if (width > 30 && height > 30) {
                // 顔領域として保存
                const faceCanvas = document.createElement('canvas');
                faceCanvas.width = width;
                faceCanvas.height = height;
                const faceCtx = faceCanvas.getContext('2d');
                faceCtx.drawImage(img, x, y, width, height, 0, 0, width, height);

                this.detectedFaces.push({
                    canvas: faceCanvas,
                    box: { x, y, width, height }
                });

                this.displayDetectedFaces();
            }
        });

        this.showMessage('画像上でドラッグして顔領域を選択してください', 'success');
    }

    showSection(sectionName) {
        // すべてのセクションを非表示
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        
        // すべてのタブボタンを非アクティブ
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active');
        });

        // 選択されたセクションとタブを表示
        document.getElementById(`${sectionName}-section`).classList.add('active');
        document.getElementById(`${sectionName}-tab`).classList.add('active');

        if (sectionName === 'list') {
            // 少し遅延させてから読み込む（DOM更新完了を待つ）
            setTimeout(() => {
                this.loadSavedFaces();
            }, 100);
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.showMessage('画像ファイルを選択してください', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.loadImage(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    async startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const video = document.getElementById('video');
            video.srcObject = stream;
            video.style.display = 'block';
            document.getElementById('capture-controls').style.display = 'block';
            document.querySelector('.upload-options').style.display = 'none';
        } catch (error) {
            this.showMessage('カメラへのアクセスが拒否されました', 'error');
        }
    }

    capturePhoto() {
        const video = document.getElementById('video');
        const canvas = document.getElementById('canvas');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        const dataURL = canvas.toDataURL('image/jpeg');
        this.loadImage(dataURL);
        this.stopCamera();
    }

    stopCamera() {
        const video = document.getElementById('video');
        const stream = video.srcObject;
        
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        
        video.style.display = 'none';
        document.getElementById('capture-controls').style.display = 'none';
        document.querySelector('.upload-options').style.display = 'flex';
    }

    loadImage(imageSrc) {
        const img = document.getElementById('uploaded-image');
        img.src = imageSrc;
        img.onload = () => {
            this.currentImage = img;
            document.getElementById('image-area').style.display = 'block';
            document.getElementById('faces-area').style.display = 'none';
            this.detectedFaces = [];
            
            // プレビューキャンバスをリセット
            const previewCanvas = document.getElementById('preview-canvas');
            previewCanvas.style.display = 'none';
            document.getElementById('toggle-preview-button').style.display = 'none';
        };
    }

    async detectFaces() {
        if (!this.currentImage) {
            this.showMessage('まず画像をアップロードしてください', 'error');
            return;
        }

        if (this.isManualMode) {
            this.enableManualSelection();
            return;
        }

        if (!this.modelsLoaded) {
            this.showMessage('モデルがまだ読み込まれていません', 'error');
            return;
        }

        try {
            this.showMessage('顔を検出中...', 'loading');
            
            const confidence = parseFloat(document.getElementById('confidence-slider').value);
            
            let detections;
            
            if (this.modelType === 'tiny') {
                // 軽量モデル使用
                const options = new faceapi.TinyFaceDetectorOptions({ 
                    inputSize: 416,
                    scoreThreshold: confidence
                });
                
                detections = await faceapi.detectAllFaces(this.currentImage, options)
                    .withFaceLandmarks(true)
                    .withFaceDescriptors();
            } else {
                // 標準モデル使用
                const options = new faceapi.SsdMobilenetv1Options({ 
                    minConfidence: confidence,
                    maxResults: 10
                });

                detections = await faceapi.detectAllFaces(this.currentImage, options)
                    .withFaceLandmarks()
                    .withFaceDescriptors();
            }

            if (detections.length === 0) {
                this.showMessage('顔が検出されませんでした。設定を調整してみてください。', 'error');
                return;
            }

            this.detectedFaces = await this.extractFaces(detections);
            this.displayDetectedFaces();
            
            // プレビュー表示の設定
            if (document.getElementById('preview-checkbox').checked) {
                this.drawFaceBoxes(detections);
            }

            this.showMessage(`${detections.length}個の顔が検出されました`, 'success');

        } catch (error) {
            console.error('Face detection error:', error);
            this.showMessage('顔検出でエラーが発生しました', 'error');
        }
    }

    async extractFaces(detections) {
        const faces = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        detections.forEach((detection, index) => {
            const box = detection.detection.box;
            
            // 顔領域を少し拡張
            const margin = 20;
            const x = Math.max(0, box.x - margin);
            const y = Math.max(0, box.y - margin);
            const width = Math.min(this.currentImage.naturalWidth - x, box.width + margin * 2);
            const height = Math.min(this.currentImage.naturalHeight - y, box.height + margin * 2);

            canvas.width = width;
            canvas.height = height;
            
            ctx.drawImage(
                this.currentImage,
                x, y, width, height,
                0, 0, width, height
            );

            const faceCanvas = document.createElement('canvas');
            faceCanvas.width = width;
            faceCanvas.height = height;
            const faceCtx = faceCanvas.getContext('2d');
            faceCtx.drawImage(canvas, 0, 0);

            faces.push({
                canvas: faceCanvas,
                box: { x, y, width, height },
                descriptor: detection.descriptor
            });
        });

        return faces;
    }

    drawFaceBoxes(detections) {
        const previewCanvas = document.getElementById('preview-canvas');
        const img = this.currentImage;
        
        previewCanvas.width = img.naturalWidth;
        previewCanvas.height = img.naturalHeight;
        previewCanvas.style.display = 'block';
        previewCanvas.style.width = img.clientWidth + 'px';
        previewCanvas.style.height = img.clientHeight + 'px';
        
        const ctx = previewCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        detections.forEach((detection, index) => {
            const box = detection.detection.box;
            
            // 顔の枠を描画
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 3;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            
            // インデックス番号を表示
            ctx.fillStyle = '#3498db';
            ctx.font = '20px Arial';
            ctx.fillText(`${index + 1}`, box.x + 5, box.y + 25);
        });

        document.getElementById('toggle-preview-button').style.display = 'inline-block';
    }

    togglePreview() {
        const previewCanvas = document.getElementById('preview-canvas');
        const isVisible = previewCanvas.style.display !== 'none';
        
        previewCanvas.style.display = isVisible ? 'none' : 'block';
        document.getElementById('toggle-preview-button').textContent = 
            isVisible ? '検出結果を表示' : '元画像を表示';
    }

    displayDetectedFaces() {
        const container = document.getElementById('faces-container');
        container.innerHTML = '';

        this.detectedFaces.forEach((face, index) => {
            const faceItem = document.createElement('div');
            faceItem.className = 'face-item';
            
            const faceImage = document.createElement('img');
            faceImage.className = 'face-image';
            faceImage.src = face.canvas.toDataURL();
            
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'name-input';
            nameInput.placeholder = '名前を入力';
            nameInput.value = '';
            
            const saveButton = document.createElement('button');
            saveButton.className = 'save-face-button';
            saveButton.textContent = '保存';
            saveButton.addEventListener('click', () => {
                if (nameInput.value.trim()) {
                    this.saveFace(face, nameInput.value.trim(), index);
                } else {
                    this.showMessage('名前を入力してください', 'error');
                }
            });
            
            faceItem.appendChild(faceImage);
            faceItem.appendChild(nameInput);
            faceItem.appendChild(saveButton);
            container.appendChild(faceItem);
        });

        document.getElementById('faces-area').style.display = 'block';
        document.getElementById('save-all-button').style.display = 
            this.detectedFaces.length > 1 ? 'inline-block' : 'none';
    }

    saveFace(face, name, index) {
        const savedFaces = this.getSavedFaces();
        const faceData = {
            id: Date.now() + index,
            name: name,
            image: face.canvas.toDataURL(),
            timestamp: new Date().toLocaleString('ja-JP')
        };

        savedFaces.push(faceData);
        localStorage.setItem('savedFaces', JSON.stringify(savedFaces));
        
        this.showMessage(`${name}さんの顔を保存しました`, 'success');
        
        // 保存した要素を非表示にする
        const faceItems = document.querySelectorAll('.face-item');
        if (faceItems[index]) {
            faceItems[index].style.opacity = '0.5';
            faceItems[index].querySelector('.save-face-button').textContent = '保存済み';
            faceItems[index].querySelector('.save-face-button').disabled = true;
        }
    }

    saveAllFaces() {
        const nameInputs = document.querySelectorAll('.name-input');
        const saveButtons = document.querySelectorAll('.save-face-button');
        let savedCount = 0;

        nameInputs.forEach((input, index) => {
            if (input.value.trim() && !saveButtons[index].disabled) {
                this.saveFace(this.detectedFaces[index], input.value.trim(), index);
                savedCount++;
            }
        });

        if (savedCount > 0) {
            this.showMessage(`${savedCount}件の顔を保存しました`, 'success');
        } else {
            this.showMessage('保存する顔がありません', 'error');
        }
    }

    getSavedFaces() {
        try {
            return JSON.parse(localStorage.getItem('savedFaces')) || [];
        } catch {
            return [];
        }
    }

    loadSavedFaces() {
        const savedFaces = this.getSavedFaces();
        const container = document.getElementById('saved-faces-container');
        const noDataMessage = document.getElementById('no-data-message');
        const clearButton = document.getElementById('clear-all-button');

        // 既存の保存されたアイテムのみを削除（no-data-messageは保持）
        const savedItems = container.querySelectorAll('.saved-face-item');
        savedItems.forEach(item => item.remove());

        if (savedFaces.length === 0) {
            noDataMessage.style.display = 'block';
            clearButton.style.display = 'none';
            return;
        }

        noDataMessage.style.display = 'none';
        clearButton.style.display = 'inline-block';

        savedFaces.forEach(face => {
            const faceItem = document.createElement('div');
            faceItem.className = 'saved-face-item';
            
            const faceImage = document.createElement('img');
            faceImage.className = 'saved-face-image';
            faceImage.src = face.image;
            
            const faceName = document.createElement('div');
            faceName.className = 'saved-face-name';
            faceName.textContent = face.name;
            
            const timestamp = document.createElement('div');
            timestamp.style.fontSize = '12px';
            timestamp.style.color = '#7f8c8d';
            timestamp.style.marginBottom = '10px';
            timestamp.textContent = face.timestamp;
            
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-face-button';
            deleteButton.textContent = '削除';
            deleteButton.addEventListener('click', () => {
                if (confirm(`${face.name}さんのデータを削除しますか？`)) {
                    this.deleteFace(face.id);
                }
            });
            
            faceItem.appendChild(faceImage);
            faceItem.appendChild(faceName);
            faceItem.appendChild(timestamp);
            faceItem.appendChild(deleteButton);
            container.appendChild(faceItem);
        });
    }

    deleteFace(faceId) {
        let savedFaces = this.getSavedFaces();
        savedFaces = savedFaces.filter(face => face.id !== faceId);
        localStorage.setItem('savedFaces', JSON.stringify(savedFaces));
        this.loadSavedFaces();
        this.showMessage('顔データを削除しました', 'success');
    }

    clearAllFaces() {
        if (confirm('すべての保存された顔データを削除しますか？この操作は取り消せません。')) {
            localStorage.removeItem('savedFaces');
            this.loadSavedFaces();
            this.showMessage('すべての顔データを削除しました', 'success');
        }
    }

    showMessage(text, type) {
        // 既存のメッセージを削除
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const message = document.createElement('div');
        message.className = `message ${type}-message`;
        message.textContent = text;

        const container = document.querySelector('.container');
        container.insertBefore(message, container.children[1]);

        // 3秒後にメッセージを自動削除（ローディングメッセージ以外）
        if (type !== 'loading') {
            setTimeout(() => {
                if (message.parentNode) {
                    message.remove();
                }
            }, 3000);
        }
    }
}

// アプリケーションの初期化
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FaceRecognitionApp();
});

// エラーハンドリング
window.addEventListener('error', (event) => {
    console.error('Application error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});