local function decode_hex(hex)
  local bytes = {}
  for index = 1, #hex, 2 do
    bytes[#bytes + 1] = string.char(tonumber(hex:sub(index, index + 1), 16))
  end
  return table.concat(bytes)
end

wrk.method = os.getenv("NODE_HTTP_BENCHMARK_METHOD") or "POST"
wrk.body = decode_hex(os.getenv("NODE_HTTP_BENCHMARK_BODY_HEX") or "")
wrk.headers["Content-Type"] =
  os.getenv("NODE_HTTP_BENCHMARK_CONTENT_TYPE") or "application/octet-stream"
wrk.headers["Content-Length"] = tostring(#wrk.body)
