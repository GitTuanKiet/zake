import { env, AutoTokenizer, XLMRobertaModel, PreTrainedModel, PreTrainedTokenizer } from '@huggingface/transformers';
env.allowLocalModels = false;

export class TokenizerSingleton {
    /**
     * Model ID
     * @type {string}
     * @static
     */
    static model_id = null;
    /**
     * Model
     * @type {PreTrainedModel}
     * @static
     */
    static model = null;
    /**
     * Tokenizer
     * @type {PreTrainedTokenizer}
     * @static
     */
    static tokenizer = null;

    constructor(tokenizer, model) {
        this.tokenizer = tokenizer;
        this.model = model;
    }

    static async getInstance(progress_callback) {
        if (this.model_id === null) {
            throw Error("Must set model_id")
        }
        env.cacheDir = '.cache';
        if (!this.tokenizer) {
            this.tokenizer = await AutoTokenizer.from_pretrained(this.model_id);
        }

        if (!this.model) {
            this.model = await XLMRobertaModel.from_pretrained(this.model_id, {
                dtype: "fp32",
                progress_callback,
            });
        }

        return [this.tokenizer, this.model];
    }
}