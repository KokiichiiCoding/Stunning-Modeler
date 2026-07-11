#pragma once
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

namespace tp::json {

namespace detail { class Parser; }

enum class Type { Null, Bool, Number, String, Array, Object };

struct JsonError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

class Value {
public:
    Value() = default;

    static Value parse(const std::string& text);

    [[nodiscard]] Type type() const { return type_; }
    [[nodiscard]] bool isNull() const { return type_ == Type::Null; }
    [[nodiscard]] bool isObject() const { return type_ == Type::Object; }
    [[nodiscard]] bool isArray() const { return type_ == Type::Array; }

    [[nodiscard]] double asNumber() const;
    [[nodiscard]] bool asBool() const;
    [[nodiscard]] const std::string& asString() const;
    [[nodiscard]] const std::vector<Value>& asArray() const;

    [[nodiscard]] bool has(const std::string& key) const;
    // Object member access. Throws JsonError with a descriptive path if missing.
    [[nodiscard]] const Value& operator[](const std::string& key) const;
    // All keys of an object value, in ascending order. Throws if not an object.
    [[nodiscard]] std::vector<std::string> objectKeys() const;

    [[nodiscard]] double numberOr(const std::string& key, double fallback) const;
    [[nodiscard]] std::string stringOr(const std::string& key, const std::string& fallback) const;
    [[nodiscard]] bool boolOr(const std::string& key, bool fallback) const;

    // For error messages: a human-readable path like "species.body_parts[3].tissue"
    void setDebugPath(std::string path) { debugPath_ = std::move(path); }
    [[nodiscard]] const std::string& debugPath() const { return debugPath_; }

private:
    Type type_{Type::Null};
    double number_{};
    bool bool_{};
    std::string string_;
    std::vector<Value> array_;
    std::map<std::string, Value> object_;
    std::string debugPath_{"$"};

    friend class detail::Parser;
};

} // namespace tp::json
