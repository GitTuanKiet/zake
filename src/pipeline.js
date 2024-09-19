import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels = false;

export class PipelineFactory {
    /**
     * Task name
     * @type {string}
     * @static
     */
    static task = null;
    /**
     * Model name
     * @type {string}
     * @static
     */
    static model = null;
    static instance = null;

    constructor(tokenizer, model) {
        this.tokenizer = tokenizer;
        this.model = model;
    }

    /**
     * Get pipeline instance
     * @param {function | undefined} progressCallback 
     * @returns {Promise}
     */
    static async getInstance(progressCallback = null) {
        if (this.task === null || this.model === null) {
            throw Error("Must set task and model")
        }
        if (this.instance === null) {
            env.cacheDir = '.cache';
            this.instance = await pipeline(this.task, this.model, {
                dtype: "fp32",
                progress_callback: progressCallback
            });
        }

        return this.instance;
    }
}