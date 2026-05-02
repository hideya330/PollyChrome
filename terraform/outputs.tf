output "api_endpoint" {
  description = "The endpoint URL for the PollyChrome API"
  value       = "${aws_api_gateway_stage.prod.invoke_url}/speak"
}

output "api_key" {
  description = "The API key required for extension requests"
  value       = aws_api_gateway_api_key.api_key.value
  sensitive   = true
}