/**
 * 独立的GIF生成器类
 * 使用gif.js库创建动画GIF，强制禁用Workers避免404错误
 */
class GifGenerator {
    constructor() {
        this.isWorkerAvailable = false; // 强制禁用workers
        console.log('GIF生成器初始化：强制禁用Workers模式');
    }

    /**
     * 创建GIF动画
     * @param {Array} canvasFrames - Canvas帧数组
     * @param {Object} options - 配置选项
     * @returns {Promise<Blob>} - 生成的GIF blob
     */
    async createGif(canvasFrames, options = {}) {
        const config = {
            workers: 0, // 强制设置为0，禁用所有workers
            quality: options.quality || 10,
            width: options.width || 800,
            height: options.height || 800,
            repeat: options.repeat !== undefined ? options.repeat : 0, // 0表示无限循环
            transparent: options.transparent || null,
            background: options.background || null,
            debug: options.debug || false,
            workerScript: null // 明确设置为null
        };

        return new Promise((resolve, reject) => {
            try {
                console.log('开始创建GIF，配置:', config);
                
                // 检查gif.js是否可用
                if (typeof GIF === 'undefined') {
                    throw new Error('GIF.js库未加载');
                }
                
                const gif = new GIF(config);
                const frameDelay = options.frameDelay || 200;

                // 添加进度监听
                if (options.onProgress) {
                    gif.on('progress', (progress) => {
                        options.onProgress(progress);
                    });
                }

                // 添加所有帧
                canvasFrames.forEach((canvas, index) => {
                    if (!canvas) {
                        console.warn(`帧 ${index} 为空，跳过`);
                        return;
                    }
                    
                    try {
                        gif.addFrame(canvas, { delay: frameDelay });
                        console.log(`添加帧 ${index + 1}/${canvasFrames.length}`);
                    } catch (error) {
                        console.error(`添加帧 ${index} 失败:`, error);
                    }
                });

                // 监听完成事件
                gif.on('finished', (blob) => {
                    console.log('GIF生成成功，大小:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
                    resolve(blob);
                });

                // 监听错误事件
                gif.on('error', (error) => {
                    console.error('GIF生成失败:', error);
                    reject(new Error(`GIF生成失败: ${error.message || error}`));
                });

                // 设置超时保护
                const timeout = setTimeout(() => {
                    reject(new Error('GIF生成超时（30秒）'));
                }, 30000);

                gif.on('finished', () => clearTimeout(timeout));
                gif.on('error', () => clearTimeout(timeout));

                // 开始渲染
                console.log('开始渲染GIF（主线程模式）...');
                gif.render();

            } catch (error) {
                console.error('创建GIF实例失败:', error);
                reject(error);
            }
        });
    }

    /**
     * 从图片数组创建GIF
     * @param {Array} imageUrls - 图片URL数组
     * @param {Object} options - 配置选项
     * @returns {Promise<Blob>} - 生成的GIF blob
     */
    async createGifFromImages(imageUrls, options = {}) {
        const canvasFrames = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = options.width || 800;
        canvas.height = options.height || 800;

        // 加载所有图片并转换为canvas
        for (let i = 0; i < imageUrls.length; i++) {
            try {
                const img = await this.loadImage(imageUrls[i]);
                
                // 清空canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // 绘制图片
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // 创建新的canvas副本
                const frameCanvas = document.createElement('canvas');
                frameCanvas.width = canvas.width;
                frameCanvas.height = canvas.height;
                const frameCtx = frameCanvas.getContext('2d');
                frameCtx.drawImage(canvas, 0, 0);
                
                canvasFrames.push(frameCanvas);
                
                if (options.onLoadProgress) {
                    options.onLoadProgress((i + 1) / imageUrls.length);
                }
                
            } catch (error) {
                console.error(`加载图片 ${i} 失败:`, error);
                throw error;
            }
        }

        return this.createGif(canvasFrames, options);
    }

    /**
     * 加载图片
     * @param {string} url - 图片URL
     * @returns {Promise<Image>} - 加载的图片对象
     */
    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            // 处理跨域
            if (url.startsWith('http')) {
                img.crossOrigin = 'anonymous';
            }
            
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`无法加载图片: ${url}`));
            
            img.src = url;
        });
    }

    /**
     * 下载GIF文件
     * @param {Blob} blob - GIF blob数据
     * @param {string} filename - 文件名
     */
    downloadGif(blob, filename = 'animation.gif') {
        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // 延迟清理URL，确保下载完成
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            
            console.log(`GIF下载启动: ${filename}`);
            return true;
        } catch (error) {
            console.error('下载GIF失败:', error);
            return false;
        }
    }

    /**
     * 验证浏览器兼容性
     * @returns {Object} - 兼容性检查结果
     */
    checkCompatibility() {
        const result = {
            canvas: !!document.createElement('canvas').getContext,
            webWorker: false, // 强制设为false，因为我们不使用workers
            blob: typeof Blob !== 'undefined',
            gifJs: typeof GIF !== 'undefined',
            objectUrl: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        };
        
        result.compatible = result.canvas && result.blob && result.gifJs && result.objectUrl;
        
        console.log('浏览器兼容性检查（无Worker模式）:', result);
        return result;
    }
}

// 导出类（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GifGenerator;
}

// 全局对象（浏览器环境）
if (typeof window !== 'undefined') {
    window.GifGenerator = GifGenerator;
}