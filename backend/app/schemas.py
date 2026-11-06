from typing import Literal
from pydantic import BaseModel, Field, model_validator

class SpecificationInput(BaseModel):
    expected: dict[str, str] = Field(default_factory=dict)
    required_fields: list[str] = Field(default_factory=lambda: ['batch_number', 'manufacturing_date', 'expiry_date'])
    expected_components: list[str] = Field(default_factory=lambda: ['carton'])
    barcode: str = ''
    date_formats: list[str] = Field(default_factory=lambda: ['%Y-%m-%d', '%m/%Y', '%m-%Y'])
    seal_required: bool = False
    reference_image_id: str | None = None
    fail_on_mismatch: bool = True
    minimum_ocr_confidence: float = Field(default=0.6, ge=0, le=1)
    @model_validator(mode='after')
    def validate_fields(self):
        allowed = {'product_name','generic_name','strength','dosage_form','manufacturer','batch_number','manufacturing_date','expiry_date','storage','composition'}
        if set(self.expected) - allowed or set(self.required_fields) - allowed:
            raise ValueError('Unsupported specification field')
        if not self.date_formats or any(f not in ['%Y-%m-%d','%d/%m/%Y','%m/%d/%Y','%m/%Y','%m-%Y','%d-%m-%Y','%Y/%m/%d','%b %Y','%B %Y'] for f in self.date_formats):
            raise ValueError('Choose supported explicit date formats')
        return self
class ProductInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    packaging: Literal['Carton','Bottle','Blister pack','Label','Vial','Ampoule','Sachet','Pouch'] = 'Carton'
    specification: SpecificationInput = Field(default_factory=SpecificationInput)
class InspectionInput(BaseModel):
    product_id: str
    image_ids: list[str] = Field(min_length=1, max_length=8)
class AnnotationInput(BaseModel):
    field: str = Field(min_length=1, max_length=100)
    value: str = Field(max_length=4000)
    reason: str = Field(min_length=3, max_length=2000)
class ReviewInput(BaseModel):
    disposition: Literal['APPROVED','REJECTED','FURTHER REVIEW']
    reason: str = Field(min_length=5, max_length=2000)
class ModelConfig(BaseModel):
    ocr: Literal['tesseract','easyocr','disabled'] = 'tesseract'
    yolo_weights: str = ''
    vlm: Literal['baseline','ollama'] = 'baseline'
    ollama_model: str = 'llava'
    blur_threshold: float = Field(default=60, ge=1, le=1000)
    brightness_min: float = Field(default=35, ge=1, le=128)
