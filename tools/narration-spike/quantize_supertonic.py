"""Create a load-checked dynamic INT8 candidate from Sonelle's pinned Supertonic graphs."""

from argparse import ArgumentParser
from pathlib import Path

import onnx
from onnxruntime.quantization import QuantType, quantize_dynamic


MODEL_PATHS = (
    "assets/onnx/duration_predictor.onnx",
    "assets/onnx/text_encoder.onnx",
    "assets/onnx/vector_estimator.onnx",
    "assets/onnx/vocoder.onnx",
)


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    arguments = parser.parse_args()

    for relative_path in MODEL_PATHS:
        source = arguments.source / relative_path
        output = arguments.output / relative_path
        if not source.is_file():
            raise FileNotFoundError(f"Pinned Supertonic graph is missing: {relative_path}")
        output.parent.mkdir(parents=True, exist_ok=True)
        quantize_dynamic(source, output, weight_type=QuantType.QInt8)
        onnx.checker.check_model(output)


if __name__ == "__main__":
    main()
