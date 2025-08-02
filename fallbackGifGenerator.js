/**
 * 备用GIF生成器 - 完全不依赖Workers
 * 直接使用canvas-to-gif技术
 */
class FallbackGifGenerator {
    constructor() {
        console.log('备用GIF生成器初始化');
    }

    /**
     * 使用简单的base64方法创建GIF
     * @param {Array} canvasFrames - Canvas帧数组
     * @param {Object} options - 配置选项
     * @returns {Promise<Blob>} - 生成的GIF blob
     */
    async createSimpleGif(canvasFrames, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                // 如果只有一帧或两帧，直接下载第一帧作为PNG
                if (canvasFrames.length <= 2) {
                    console.log('帧数较少，下载为静态图片');
                    canvasFrames[0].toBlob((blob) => {
                        resolve(blob);
                    }, 'image/png');
                    return;
                }

                // 创建一个简单的GIF数据结构
                const width = options.width || 800;
                const height = options.height || 800;
                const delay = options.frameDelay || 200;

                // 尝试使用第三方库如果可用
                if (typeof GIF !== 'undefined') {
                    this.createWithGifJs(canvasFrames, options).then(resolve).catch(reject);
                } else {
                    // 最后的备选方案：下载所有帧作为图片序列
                    this.downloadFrameSequence(canvasFrames, options);
                    reject(new Error('无法创建GIF，已下载图片序列'));
                }

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 使用gif.js创建（无Worker版本）
     */
    async createWithGifJs(canvasFrames, options) {
        return new Promise((resolve, reject) => {
            try {
                const gif = new GIF({
                    workers: 0,
                    quality: 10,
                    width: options.width || 800,
                    height: options.height || 800,
                    repeat: 0,
                    workerScript: undefined,
                    background: '#FFFFFF'
                });

                // 添加帧
                canvasFrames.forEach((canvas, index) => {
                    gif.addFrame(canvas, { delay: options.frameDelay || 200 });
                });

                gif.on('finished', resolve);
                gif.on('error', reject);

                // 设置较短的超时
                setTimeout(() => {
                    reject(new Error('GIF生成超时'));
                }, 15000);

                gif.render();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 下载帧序列作为备选方案
     */
    downloadFrameSequence(canvasFrames, options) {
        canvasFrames.forEach((canvas, index) => {
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `frame_${index}.png`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, 'image/png');
        });
    }
}

// 全局对象
if (typeof window !== 'undefined') {
    window.FallbackGifGenerator = FallbackGifGenerator;
}