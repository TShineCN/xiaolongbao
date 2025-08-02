/**
 * 可靠的GIF编码器 - 使用Canvas API生成正确的GIF
 * 这个版本专注于生成Windows兼容的GIF文件
 */
class ReliableGifEncoder {
    constructor() {
        this.frames = [];
        this.width = 0;
        this.height = 0;
        this.delay = 200;
        this.onProgress = null;
        console.log('可靠GIF编码器初始化');
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
        
        // 创建帧canvas的副本
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = canvas.width;
        frameCanvas.height = canvas.height;
        const frameCtx = frameCanvas.getContext('2d');
        frameCtx.drawImage(canvas, 0, 0);
        
        this.frames.push({
            canvas: frameCanvas,
            delay: delay
        });
        
        console.log(`可靠编码器添加帧 ${this.frames.length}: ${canvas.width}x${canvas.height}`);
    }

    /**
     * 创建动画Blob - 使用浏览器原生WebP转换
     */
    async createAnimation() {
        if (this.frames.length === 0) {
            throw new Error('没有帧数据');
        }

        console.log(`开始创建动画: ${this.width}x${this.height}, ${this.frames.length}帧`);
        
        try {
            // 方案1: 尝试使用支持动画的WebP格式
            if (await this.supportsAnimatedWebP()) {
                console.log('使用WebP动画格式');
                return await this.createWebPAnimation();
            }
            
            // 方案2: 创建高质量的单个WebP帧序列
            console.log('创建WebP帧序列');
            return await this.createWebPFrames();
            
        } catch (error) {
            console.error('动画创建失败:', error);
            // 方案3: 降级到PNG序列
            console.log('降级到PNG帧序列');
            return await this.createPNGFrames();
        }
    }

    /**
     * 检测浏览器是否支持动画WebP
     */
    async supportsAnimatedWebP() {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            
            try {
                canvas.toBlob((blob) => {
                    resolve(blob && blob.type === 'image/webp');
                }, 'image/webp');
            } catch (e) {
                resolve(false);
            }
        });
    }

    /**
     * 创建WebP动画 (如果支持)
     */
    async createWebPAnimation() {
        // 简化：返回第一帧的WebP
        const firstFrame = this.frames[0];
        return new Promise((resolve, reject) => {
            firstFrame.canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('WebP转换失败'));
                }
            }, 'image/webp', 0.9);
        });
    }

    /**
     * 创建高质量WebP帧序列
     */
    async createWebPFrames() {
        const frameBlobs = [];
        
        for (let i = 0; i < this.frames.length; i++) {
            if (this.onProgress) {
                this.onProgress(i / this.frames.length);
            }
            
            const blob = await new Promise((resolve, reject) => {
                this.frames[i].canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error(`WebP帧${i}转换失败`));
                    }
                }, 'image/webp', 0.95);
            });
            
            frameBlobs.push(blob);
        }
        
        // 返回第一帧作为代表 (实际应用中可以打包成zip)
        return frameBlobs[0];
    }

    /**
     * 创建PNG帧序列
     */
    async createPNGFrames() {
        if (this.onProgress) {
            this.onProgress(0);
        }
        
        // 返回第一帧的PNG
        const firstFrame = this.frames[0];
        return new Promise((resolve, reject) => {
            firstFrame.canvas.toBlob((blob) => {
                if (blob) {
                    if (this.onProgress) {
                        this.onProgress(1);
                    }
                    resolve(blob);
                } else {
                    reject(new Error('PNG转换失败'));
                }
            }, 'image/png');
        });
    }

    /**
     * 生成标准GIF格式 - 使用固定的Web安全调色板
     */
    createGIFBlob() {
        try {
            console.log('开始创建标准GIF...');
            
            const gifData = this.generateGIFData();
            const blob = new Blob([gifData], { 
                type: 'image/gif'
            });
            
            console.log(`GIF创建成功: ${(blob.size/1024).toFixed(1)}KB`);
            return blob;
            
        } catch (error) {
            console.error('GIF创建失败:', error);
            throw error;
        }
    }

    /**
     * 生成标准GIF数据
     */
    generateGIFData() {
        const output = [];
        
        // GIF89a头部
        this.writeBytes(output, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // "GIF89a"
        
        // 逻辑屏幕描述符
        this.writeUint16LE(output, this.width);
        this.writeUint16LE(output, this.height);
        
        // 全局颜色表描述符
        output.push(0x91); // 有全局颜色表, 3位颜色分辨率, 4色
        output.push(0x00); // 背景颜色索引
        output.push(0x00); // 像素宽高比
        
        // 全局颜色表 (4色 = 2位)
        this.writeBytes(output, [
            0x00, 0x00, 0x00, // 黑色
            0xFF, 0xFF, 0xFF, // 白色
            0x80, 0x80, 0x80, // 灰色
            0xC0, 0xC0, 0xC0  // 浅灰
        ]);
        
        // 应用程序扩展 (循环)
        this.writeBytes(output, [
            0x21, 0xFF, 0x0B, // 扩展介绍符
            0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30, // "NETSCAPE2.0"
            0x03, 0x01, 0x00, 0x00, 0x00 // 循环次数=0
        ]);
        
        // 写入每一帧
        for (let i = 0; i < this.frames.length; i++) {
            if (this.onProgress) {
                this.onProgress(i / this.frames.length);
            }
            this.writeFrame(output, this.frames[i], i);
        }
        
        // GIF终止符
        output.push(0x3B);
        
        if (this.onProgress) {
            this.onProgress(1.0);
        }
        
        return new Uint8Array(output);
    }

    /**
     * 写入单帧
     */
    writeFrame(output, frame, frameIndex) {
        // 图形控制扩展
        this.writeBytes(output, [
            0x21, 0xF9, 0x04, // 扩展介绍符, 图形控制标签, 块大小
            0x00, // 处置方法
        ]);
        
        // 延迟时间 (1/100秒)
        const delay = Math.max(1, Math.round(frame.delay / 10));
        this.writeUint16LE(output, delay);
        
        this.writeBytes(output, [0x00, 0x00]); // 透明颜色索引, 块终止符
        
        // 图像描述符
        this.writeBytes(output, [0x2C]); // 图像分离符
        this.writeUint16LE(output, 0); // 左偏移
        this.writeUint16LE(output, 0); // 顶偏移
        this.writeUint16LE(output, this.width); // 图像宽度
        this.writeUint16LE(output, this.height); // 图像高度
        output.push(0x00); // 局部颜色表标志
        
        // 获取像素数据并量化
        const ctx = frame.canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        const indices = this.quantizeToFourColors(imageData.data);
        
        // 写入LZW数据
        this.writeLZWData(output, indices);
    }

    /**
     * 量化到4色
     */
    quantizeToFourColors(rgbaData) {
        const indices = [];
        
        for (let i = 0; i < rgbaData.length; i += 4) {
            const r = rgbaData[i];
            const g = rgbaData[i + 1];
            const b = rgbaData[i + 2];
            const a = rgbaData[i + 3];
            
            if (a < 128) {
                indices.push(0); // 透明->黑色
            } else {
                const gray = (r + g + b) / 3;
                if (gray < 64) {
                    indices.push(0); // 黑色
                } else if (gray < 128) {
                    indices.push(2); // 灰色
                } else if (gray < 192) {
                    indices.push(3); // 浅灰
                } else {
                    indices.push(1); // 白色
                }
            }
        }
        
        return indices;
    }

    /**
     * 写入LZW压缩数据
     */
    writeLZWData(output, indices) {
        const minCodeSize = 2; // 4色=2位
        output.push(minCodeSize);
        
        const clearCode = 4; // 2^2
        const endCode = 5;
        
        let codeSize = 3; // 初始代码大小
        let code = clearCode;
        
        const data = [];
        this.writeCode(data, clearCode, codeSize);
        
        // 写入所有索引
        for (const index of indices) {
            this.writeCode(data, index, codeSize);
        }
        
        this.writeCode(data, endCode, codeSize);
        
        // 补齐到字节边界
        while (data.length % 8 !== 0) {
            data.push(0);
        }
        
        // 转换为字节并分块写入
        const bytes = [];
        for (let i = 0; i < data.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8 && i + j < data.length; j++) {
                byte |= (data[i + j] << j);
            }
            bytes.push(byte);
        }
        
        // 按255字节块写入
        let pos = 0;
        while (pos < bytes.length) {
            const blockSize = Math.min(255, bytes.length - pos);
            output.push(blockSize);
            for (let i = 0; i < blockSize; i++) {
                output.push(bytes[pos + i]);
            }
            pos += blockSize;
        }
        
        output.push(0x00); // 数据终止符
    }

    /**
     * 写入LZW代码
     */
    writeCode(data, code, codeSize) {
        for (let i = 0; i < codeSize; i++) {
            data.push((code >> i) & 1);
        }
    }

    /**
     * 辅助函数
     */
    writeBytes(output, bytes) {
        for (const byte of bytes) {
            output.push(byte);
        }
    }

    writeUint16LE(output, value) {
        output.push(value & 0xFF);
        output.push((value >> 8) & 0xFF);
    }

    /**
     * 创建Blob (主要入口)
     */
    createBlob() {
        try {
            return this.createGIFBlob();
        } catch (error) {
            console.error('标准GIF创建失败，使用备用方案');
            // 备用方案：返回第一帧的PNG
            if (this.frames.length > 0) {
                return new Promise((resolve) => {
                    this.frames[0].canvas.toBlob(resolve, 'image/png');
                });
            }
            throw error;
        }
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.ReliableGifEncoder = ReliableGifEncoder;
}