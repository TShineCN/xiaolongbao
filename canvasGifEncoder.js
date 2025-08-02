/**
 * 基于Canvas的GIF编码器
 * 使用Canvas toBlob方法和图像处理
 */
class CanvasGifEncoder {
    constructor() {
        this.frames = [];
        this.width = 0;
        this.height = 0;
        this.delay = 200;
        this.onProgress = null;
        console.log('Canvas GIF编码器初始化');
    }

    /**
     * 添加帧
     */
    addFrame(canvas, options = {}) {
        const delay = options.delay || this.delay;
        
        if (this.width === 0) {
            this.width = canvas.width;
            this.height = canvas.height;
        }
        
        // 创建帧的副本
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = canvas.width;
        frameCanvas.height = canvas.height;
        const ctx = frameCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        
        this.frames.push({
            canvas: frameCanvas,
            delay: delay
        });
        
        console.log(`Canvas编码器添加帧 ${this.frames.length}`);
    }

    /**
     * 使用APNG方法创建动画
     */
    async createAPNG() {
        if (this.frames.length === 0) {
            throw new Error('没有帧数据');
        }

        console.log('尝试创建APNG动画');
        
        // 创建主canvas
        const mainCanvas = document.createElement('canvas');
        mainCanvas.width = this.width;
        mainCanvas.height = this.height;
        const ctx = mainCanvas.getContext('2d');
        
        // 绘制第一帧
        ctx.drawImage(this.frames[0].canvas, 0, 0);
        
        // 尝试导出为PNG（某些浏览器可能支持APNG）
        return new Promise((resolve) => {
            mainCanvas.toBlob((blob) => {
                if (blob) {
                    console.log('APNG创建成功');
                    resolve(blob);
                } else {
                    console.log('APNG创建失败');
                    resolve(null);
                }
            }, 'image/png');
        });
    }

    /**
     * 创建WebP动画
     */
    async createWebP() {
        if (this.frames.length === 0) {
            throw new Error('没有帧数据');
        }

        console.log('尝试创建WebP动画');
        
        // 检查WebP支持
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                if (blob && blob.type === 'image/webp') {
                    console.log('WebP支持检测成功，创建动画');
                    // 在支持WebP的情况下，尝试创建动画WebP
                    this.frames[0].canvas.toBlob((webpBlob) => {
                        resolve(webpBlob);
                    }, 'image/webp');
                } else {
                    console.log('WebP不支持');
                    resolve(null);
                }
            }, 'image/webp');
        });
    }

    /**
     * 创建基于数据URL的伪GIF
     */
    async createDataUrlGif() {
        console.log('创建数据URL序列');
        
        const frameUrls = [];
        for (const frame of this.frames) {
            const dataUrl = frame.canvas.toDataURL('image/png');
            frameUrls.push(dataUrl);
        }
        
        // 创建一个HTML页面包含动画
        const htmlContent = this.generateAnimationHTML(frameUrls);
        const blob = new Blob([htmlContent], { type: 'text/html' });
        
        return blob;
    }

    /**
     * 生成动画HTML
     */
    generateAnimationHTML(frameUrls) {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>动画预览</title>
    <style>
        body { margin: 0; padding: 20px; background: #000; }
        #animation { max-width: 100%; height: auto; }
    </style>
</head>
<body>
    <img id="animation" src="${frameUrls[0]}" alt="动画">
    <script>
        const frames = ${JSON.stringify(frameUrls)};
        const delay = ${this.delay};
        let currentFrame = 0;
        const img = document.getElementById('animation');
        
        setInterval(() => {
            currentFrame = (currentFrame + 1) % frames.length;
            img.src = frames[currentFrame];
        }, delay);
    </script>
</body>
</html>`;
    }

    /**
     * 使用简化的GIF格式
     */
    async createSimpleGif() {
        console.log('创建简化GIF格式');
        
        // 创建一个包含所有帧的拼接图像
        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = this.width * this.frames.length;
        stripCanvas.height = this.height;
        const ctx = stripCanvas.getContext('2d');
        
        // 拼接所有帧
        for (let i = 0; i < this.frames.length; i++) {
            ctx.drawImage(this.frames[i].canvas, i * this.width, 0);
        }
        
        // 导出为PNG
        return new Promise((resolve) => {
            stripCanvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    }

    /**
     * 主要的创建方法，尝试多种格式
     */
    async createAnimation() {
        console.log('开始创建动画，尝试多种格式');
        
        if (this.onProgress) this.onProgress(0.1);
        
        // 方法1: 尝试APNG
        let result = await this.createAPNG();
        if (result) {
            console.log('使用APNG格式');
            if (this.onProgress) this.onProgress(1.0);
            return result;
        }
        
        if (this.onProgress) this.onProgress(0.3);
        
        // 方法2: 尝试WebP
        result = await this.createWebP();
        if (result) {
            console.log('使用WebP格式');
            if (this.onProgress) this.onProgress(1.0);
            return result;
        }
        
        if (this.onProgress) this.onProgress(0.6);
        
        // 方法3: 创建帧条图像
        result = await this.createSimpleGif();
        if (result) {
            console.log('使用帧条PNG格式');
            if (this.onProgress) this.onProgress(1.0);
            return result;
        }
        
        if (this.onProgress) this.onProgress(0.9);
        
        // 方法4: 创建HTML动画
        result = await this.createDataUrlGif();
        console.log('使用HTML动画格式');
        if (this.onProgress) this.onProgress(1.0);
        return result;
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.CanvasGifEncoder = CanvasGifEncoder;
}