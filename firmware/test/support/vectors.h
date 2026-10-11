// Shared helpers for native tests: reading files from the repo and feeding bytes to the decoder.
#pragma once

#include <ArduinoJson.h>
#include <unity.h>
#include <stdint.h>

#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "decoder.h"

inline std::string readRepoFile(const std::string& path) {
  std::ifstream f(std::string(QS_REPO_ROOT) + "/" + path);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

inline JsonDocument readJson(const std::string& path) {
  JsonDocument doc;
  deserializeJson(doc, readRepoFile(path));
  return doc;
}

// "0E 01 FF" → bytes
inline std::vector<uint8_t> fromHex(const char* hex) {
  std::vector<uint8_t> out;
  if (!hex) {
    TEST_FAIL_MESSAGE("missing hex string (JSON string too long?)");
    return out;
  }
  std::istringstream in(hex);
  std::string b;
  while (in >> b) out.push_back((uint8_t)std::strtol(b.c_str(), nullptr, 16));
  return out;
}

// v1 C-array text ("0x81,0x13,...") → bytes
inline std::vector<uint8_t> fromCArray(const std::string& text) {
  std::vector<uint8_t> out;
  for (size_t i = text.find("0x"); i != std::string::npos; i = text.find("0x", i + 2)) {
    out.push_back((uint8_t)std::strtol(text.c_str() + i + 2, nullptr, 16));
  }
  return out;
}

// Serves bytes up to `limit`, then reports "nothing available yet" like an empty serial buffer.
struct BufferSource : qs::ByteSource {
  const std::vector<uint8_t>& bytes;
  size_t pos = 0;
  size_t limit;
  explicit BufferSource(const std::vector<uint8_t>& b) : bytes(b), limit(b.size()) {}
  int read() override { return pos < limit && pos < bytes.size() ? bytes[pos++] : -1; }
};
