module.exports.arrayChunk = function (a, size) {
  return a.reduce((chunks, el) => {
    if (!chunks[0]) chunks.push([])
    if (chunks[chunks.length - 1].length === size) chunks.push([])

    chunks[chunks.length - 1].push(el)

    return chunks
  }, [])
}
