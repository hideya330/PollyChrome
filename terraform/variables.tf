variable "aws_region" {
  description = "The AWS region to deploy resources to"
  type        = string
  default     = "ap-northeast-1"
}

variable "api_burst_limit" {
  description = "The API Gateway usage plan burst limit"
  type        = number
  default     = 5
}

variable "api_rate_limit" {
  description = "The API Gateway usage plan rate limit (requests per second)"
  type        = number
  default     = 0.08
}

variable "api_quota_limit" {
  description = "The API Gateway usage plan quota limit per month"
  type        = number
  default     = 1000
}