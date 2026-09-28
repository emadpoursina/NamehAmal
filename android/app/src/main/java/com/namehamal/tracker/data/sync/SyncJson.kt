package com.namehamal.tracker.data.sync

/** Minimal JSON writer/parser in pure Kotlin (no extra dependencies, JVM-testable). */
object SyncJson {
    fun stringify(value: Any?): String = buildString { appendValue(this, value) }

    private fun appendValue(out: StringBuilder, value: Any?) {
        when (value) {
            null -> out.append("null")
            is String -> {
                out.append('"')
                for (char in value) {
                    when (char) {
                        '"' -> out.append("\\\"")
                        '\\' -> out.append("\\\\")
                        '\n' -> out.append("\\n")
                        '\r' -> out.append("\\r")
                        '\t' -> out.append("\\t")
                        else -> if (char < ' ') out.append("\\u%04x".format(char.code)) else out.append(char)
                    }
                }
                out.append('"')
            }
            is Boolean -> out.append(if (value) "true" else "false")
            is Number -> out.append(value.toString())
            is Map<*, *> -> {
                out.append('{')
                value.entries.forEachIndexed { index, entry ->
                    if (index > 0) out.append(',')
                    appendValue(out, entry.key.toString())
                    out.append(':')
                    appendValue(out, entry.value)
                }
                out.append('}')
            }
            is Iterable<*> -> {
                out.append('[')
                value.forEachIndexed { index, item ->
                    if (index > 0) out.append(',')
                    appendValue(out, item)
                }
                out.append(']')
            }
            else -> throw IllegalArgumentException("Unsupported JSON value: ${value::class}")
        }
    }

    fun parse(text: String): Any? = Parser(text).parseValue()

    private class Parser(val text: String) {
        var pos = 0

        fun parseValue(): Any? {
            skipGaps()
            if (pos >= text.length) throw IllegalArgumentException("Unexpected end of JSON.")
            return when (text[pos]) {
                '{' -> parseObject()
                '[' -> parseArray()
                '"' -> parseString()
                't' -> expectLiteral("true", true)
                'f' -> expectLiteral("false", false)
                'n' -> expectLiteral("null", null)
                else -> parseNumber()
            }
        }

        private fun skipGaps() {
            while (pos < text.length && text[pos].isWhitespace()) pos += 1
        }

        private fun parseObject(): Map<String, Any?> {
            pos += 1
            val result = LinkedHashMap<String, Any?>()
            skipGaps()
            if (pos < text.length && text[pos] == '}') {
                pos += 1
                return result
            }
            while (true) {
                skipGaps()
                val key = parseString()
                skipGaps()
                require(pos < text.length && text[pos] == ':') { "Expected ':' in object." }
                pos += 1
                result[key] = parseValue()
                skipGaps()
                require(pos < text.length) { "Unterminated object." }
                if (text[pos] == '}') {
                    pos += 1
                    return result
                }
                require(text[pos] == ',') { "Expected ',' in object." }
                pos += 1
            }
        }

        private fun parseArray(): List<Any?> {
            pos += 1
            val result = ArrayList<Any?>()
            skipGaps()
            if (pos < text.length && text[pos] == ']') {
                pos += 1
                return result
            }
            while (true) {
                result.add(parseValue())
                skipGaps()
                require(pos < text.length) { "Unterminated array." }
                if (text[pos] == ']') {
                    pos += 1
                    return result
                }
                require(text[pos] == ',') { "Expected ',' in array." }
                pos += 1
            }
        }

        private fun parseString(): String {
            require(text[pos] == '"') { "Expected string." }
            pos += 1
            val out = StringBuilder()
            while (pos < text.length) {
                val char = text[pos++]
                if (char == '"') return out.toString()
                if (char == '\\') {
                    require(pos < text.length) { "Unterminated escape." }
                    when (val esc = text[pos++]) {
                        '"', '\\', '/' -> out.append(esc)
                        'n' -> out.append('\n')
                        'r' -> out.append('\r')
                        't' -> out.append('\t')
                        'b' -> out.append('\b')
                        'u' -> {
                            require(pos + 4 <= text.length) { "Bad unicode escape." }
                            out.append(text.substring(pos, pos + 4).toInt(16).toChar())
                            pos += 4
                        }
                        else -> throw IllegalArgumentException("Bad escape: $esc")
                    }
                } else {
                    out.append(char)
                }
            }
            throw IllegalArgumentException("Unterminated string.")
        }

        private fun expectLiteral(literal: String, value: Any?): Any? {
            require(text.startsWith(literal, pos)) { "Unexpected token." }
            pos += literal.length
            return value
        }

        private fun parseNumber(): Number {
            val start = pos
            while (pos < text.length && text[pos] !in ",}] \t\r\n") pos += 1
            val token = text.substring(start, pos)
            return token.toLongOrNull() ?: token.toDoubleOrNull()
                ?: throw IllegalArgumentException("Bad number: $token")
        }
    }

    @Suppress("UNCHECKED_CAST")
    fun asObject(value: Any?): Map<String, Any?> = value as? Map<String, Any?> ?: emptyMap()

    @Suppress("UNCHECKED_CAST")
    fun asList(value: Any?): List<Any?> = value as? List<Any?> ?: emptyList()

    fun asString(value: Any?): String? = value as? String
}
