#include "engine/io/Json.hpp"

#include <cctype>
#include <cmath>
#include <sstream>

namespace tp::json {

namespace detail {

class Parser {
public:
    explicit Parser(const std::string& text) : text_(text) {}

    Value parseDocument() {
        skipWhitespace();
        Value v = parseValue();
        skipWhitespace();
        if (pos_ != text_.size()) {
            fail("Unexpected trailing content after JSON document");
        }
        return v;
    }

private:
    const std::string& text_;
    std::size_t pos_{0};

    [[noreturn]] void fail(const std::string& message) const {
        std::size_t line = 1;
        std::size_t col = 1;
        for (std::size_t i = 0; i < pos_ && i < text_.size(); ++i) {
            if (text_[i] == '\n') { ++line; col = 1; } else { ++col; }
        }
        std::ostringstream oss;
        oss << message << " (line " << line << ", column " << col << ")";
        throw JsonError(oss.str());
    }

    [[nodiscard]] bool atEnd() const { return pos_ >= text_.size(); }

    [[nodiscard]] char peek() const {
        if (atEnd()) fail("Unexpected end of JSON input");
        return text_[pos_];
    }

    char advance() {
        if (atEnd()) fail("Unexpected end of JSON input");
        return text_[pos_++];
    }

    void skipWhitespace() {
        while (!atEnd()) {
            const char c = text_[pos_];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                ++pos_;
            } else if (c == '/' && pos_ + 1 < text_.size() && text_[pos_ + 1] == '/') {
                // Permit // line comments; JSON proper forbids them, but this is a
                // hand-tuning data format for developers, not a wire protocol.
                while (!atEnd() && text_[pos_] != '\n') ++pos_;
            } else {
                break;
            }
        }
    }

    void expect(char c) {
        if (atEnd() || text_[pos_] != c) {
            fail(std::string("Expected '") + c + "'");
        }
        ++pos_;
    }

    Value parseValue() {
        skipWhitespace();
        if (atEnd()) fail("Unexpected end of JSON input while expecting a value");
        const char c = peek();
        if (c == '{') return parseObject();
        if (c == '[') return parseArray();
        if (c == '"') return parseString();
        if (c == 't' || c == 'f') return parseBool();
        if (c == 'n') return parseNull();
        if (c == '-' || std::isdigit(static_cast<unsigned char>(c))) return parseNumber();
        fail(std::string("Unexpected character '") + c + "' while parsing value");
    }

    Value parseObject() {
        Value v;
        v.type_ = Type::Object;
        expect('{');
        skipWhitespace();
        if (!atEnd() && peek() == '}') { advance(); return v; }
        while (true) {
            skipWhitespace();
            if (atEnd() || peek() != '"') fail("Expected string key in object");
            Value key = parseString();
            skipWhitespace();
            expect(':');
            Value val = parseValue();
            val.setDebugPath(v.debugPath() == "$" ? key.asString() : v.debugPath() + "." + key.asString());
            v.object_[key.asString()] = std::move(val);
            skipWhitespace();
            if (!atEnd() && peek() == ',') { advance(); continue; }
            break;
        }
        skipWhitespace();
        expect('}');
        return v;
    }

    Value parseArray() {
        Value v;
        v.type_ = Type::Array;
        expect('[');
        skipWhitespace();
        if (!atEnd() && peek() == ']') { advance(); return v; }
        int index = 0;
        while (true) {
            Value val = parseValue();
            val.setDebugPath(v.debugPath() + "[" + std::to_string(index++) + "]");
            v.array_.push_back(std::move(val));
            skipWhitespace();
            if (!atEnd() && peek() == ',') { advance(); continue; }
            break;
        }
        skipWhitespace();
        expect(']');
        return v;
    }

    Value parseString() {
        Value v;
        v.type_ = Type::String;
        expect('"');
        std::string out;
        while (true) {
            if (atEnd()) fail("Unterminated string literal");
            char c = advance();
            if (c == '"') break;
            if (c == '\\') {
                if (atEnd()) fail("Unterminated escape sequence");
                char esc = advance();
                switch (esc) {
                    case '"': out += '"'; break;
                    case '\\': out += '\\'; break;
                    case '/': out += '/'; break;
                    case 'n': out += '\n'; break;
                    case 't': out += '\t'; break;
                    case 'r': out += '\r'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'u': {
                        // Minimal \uXXXX support: emit as raw byte if in ASCII
                        // range; full UTF-16 surrogate handling isn't needed
                        // for the ASCII identifiers/labels this engine uses.
                        if (pos_ + 4 > text_.size()) fail("Truncated \\u escape");
                        std::string hex = text_.substr(pos_, 4);
                        pos_ += 4;
                        int code = std::stoi(hex, nullptr, 16);
                        if (code < 128) out += static_cast<char>(code);
                        break;
                    }
                    default: fail("Unknown escape character");
                }
            } else {
                out += c;
            }
        }
        v.string_ = std::move(out);
        return v;
    }

    Value parseBool() {
        Value v;
        v.type_ = Type::Bool;
        if (text_.compare(pos_, 4, "true") == 0) {
            v.bool_ = true; pos_ += 4;
        } else if (text_.compare(pos_, 5, "false") == 0) {
            v.bool_ = false; pos_ += 5;
        } else {
            fail("Invalid literal, expected 'true' or 'false'");
        }
        return v;
    }

    Value parseNull() {
        Value v;
        v.type_ = Type::Null;
        if (text_.compare(pos_, 4, "null") == 0) {
            pos_ += 4;
        } else {
            fail("Invalid literal, expected 'null'");
        }
        return v;
    }

    Value parseNumber() {
        Value v;
        v.type_ = Type::Number;
        const std::size_t start = pos_;
        if (!atEnd() && peek() == '-') advance();
        while (!atEnd() && std::isdigit(static_cast<unsigned char>(peek()))) advance();
        if (!atEnd() && peek() == '.') {
            advance();
            while (!atEnd() && std::isdigit(static_cast<unsigned char>(peek()))) advance();
        }
        if (!atEnd() && (peek() == 'e' || peek() == 'E')) {
            advance();
            if (!atEnd() && (peek() == '+' || peek() == '-')) advance();
            while (!atEnd() && std::isdigit(static_cast<unsigned char>(peek()))) advance();
        }
        const std::string token = text_.substr(start, pos_ - start);
        if (token.empty() || token == "-") fail("Invalid number literal");
        try {
            v.number_ = std::stod(token);
        } catch (const std::exception&) {
            fail("Invalid number literal: '" + token + "'");
        }
        return v;
    }
};

} // namespace detail

Value Value::parse(const std::string& text) {
    detail::Parser parser(text);
    return parser.parseDocument();
}

double Value::asNumber() const {
    if (type_ != Type::Number) {
        throw JsonError("Expected number at " + debugPath_);
    }
    return number_;
}

bool Value::asBool() const {
    if (type_ != Type::Bool) {
        throw JsonError("Expected bool at " + debugPath_);
    }
    return bool_;
}

const std::string& Value::asString() const {
    if (type_ != Type::String) {
        throw JsonError("Expected string at " + debugPath_);
    }
    return string_;
}

const std::vector<Value>& Value::asArray() const {
    if (type_ != Type::Array) {
        throw JsonError("Expected array at " + debugPath_);
    }
    return array_;
}

bool Value::has(const std::string& key) const {
    return type_ == Type::Object && object_.find(key) != object_.end();
}

const Value& Value::operator[](const std::string& key) const {
    if (type_ != Type::Object) {
        throw JsonError("Expected object at " + debugPath_ + " while looking up key '" + key + "'");
    }
    auto it = object_.find(key);
    if (it == object_.end()) {
        throw JsonError("Missing required key '" + key + "' at " + debugPath_);
    }
    return it->second;
}

std::vector<std::string> Value::objectKeys() const {
    if (type_ != Type::Object) {
        throw JsonError("Expected object at " + debugPath_);
    }
    std::vector<std::string> keys;
    keys.reserve(object_.size());
    for (const auto& [k, v] : object_) {
        keys.push_back(k);
    }
    return keys;
}

double Value::numberOr(const std::string& key, double fallback) const {
    if (!has(key)) return fallback;
    return (*this)[key].asNumber();
}

std::string Value::stringOr(const std::string& key, const std::string& fallback) const {
    if (!has(key)) return fallback;
    return (*this)[key].asString();
}

bool Value::boolOr(const std::string& key, bool fallback) const {
    if (!has(key)) return fallback;
    return (*this)[key].asBool();
}

} // namespace tp::json
