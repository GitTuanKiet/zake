import { getEncodingNameForModel, getEncoding, type TiktokenEncoding, type TiktokenModel, type Tiktoken } from "js-tiktoken";

export function getEncodingFormModel(model?: TiktokenModel) {
    let encodingName: TiktokenEncoding = 'cl100k_base';
    try {
        encodingName = getEncodingNameForModel(model!);
    } catch { }

    return getEncoding(encodingName);
}

export function countTokens(tiktoken: Tiktoken, text: string) {
    return tiktoken.encode(text).length;
}

export function estimateToken(input: string | string[], model?: TiktokenModel): number {
    const tiktoken = getEncodingFormModel(model);
    if (typeof input === 'string') {
        return countTokens(tiktoken, input);
    }

    const perMessageFactorTokens = input.length * 3;
    const tokensFromContent = input.reduce(
        (a, b) => a + countTokens(tiktoken, b),
        0
    );
    const diffCoefficient = 5;
    return perMessageFactorTokens + tokensFromContent + diffCoefficient;
}