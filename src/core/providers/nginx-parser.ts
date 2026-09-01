import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import type { NginxServerBlock, NginxUpstream } from '../../shared/model.ts'

export interface ParsedNginxConfig {
  servers: NginxServerBlock[]
  upstreams: NginxUpstream[]
  includedFiles: string[]
  errors: Array<{ file: string; line?: number; message: string }>
}

interface BlockContext {
  type: string
  args: string[]
  parent?: BlockContext
  startLine: number
  directives: Array<{ name: string; args: string[]; line: number }>
  children: BlockContext[]
}

/**
 * Tokenizes and parses an Nginx configuration file and any recursively included files.
 */
export class NginxParser {
  private visitedFiles = new Set<string>()

  /**
   * Parse an Nginx configuration file starting from rootPath.
   */
  parseFile(filePath: string): ParsedNginxConfig {
    this.visitedFiles.clear()
    const result: ParsedNginxConfig = {
      servers: [],
      upstreams: [],
      includedFiles: [],
      errors: [],
    }

    if (!existsSync(filePath)) {
      result.errors.push({ file: filePath, message: `File does not exist: ${filePath}` })
      return result
    }

    this.parseFileInternal(filePath, result)
    return result
  }

  /**
   * Parse raw Nginx config text directly (useful for tests and in-memory configs).
   */
  parseContent(content: string, virtualPath = 'nginx.conf'): ParsedNginxConfig {
    const result: ParsedNginxConfig = {
      servers: [],
      upstreams: [],
      includedFiles: [virtualPath],
      errors: [],
    }

    const ast = this.tokenizeAndParse(content, virtualPath, result)
    this.extractEntities(ast, virtualPath, result)
    return result
  }

  private parseFileInternal(filePath: string, result: ParsedNginxConfig): void {
    const normalizedPath = resolve(filePath)
    if (this.visitedFiles.has(normalizedPath)) {
      return // prevent circular includes
    }
    this.visitedFiles.add(normalizedPath)
    result.includedFiles.push(normalizedPath)

    let content = ''
    try {
      content = readFileSync(normalizedPath, 'utf8')
    } catch (err) {
      result.errors.push({
        file: normalizedPath,
        message: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      })
      return
    }

    const ast = this.tokenizeAndParse(content, normalizedPath, result)
    this.extractEntities(ast, normalizedPath, result)
  }

  private tokenizeAndParse(
    content: string,
    currentFile: string,
    result: ParsedNginxConfig
  ): BlockContext {
    const rootBlock: BlockContext = {
      type: 'root',
      args: [],
      startLine: 1,
      directives: [],
      children: [],
    }

    let currentBlock = rootBlock
    const lines = content.split(/\r?\n/)

    let inComment = false
    let inQuote: '"' | "'" | null = null
    let currentToken = ''
    let tokens: string[] = []
    let currentTokenLine = 1

    for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
      const line = lines[lineNum - 1]
      inComment = false

      for (let col = 0; col < line.length; col++) {
        const char = line[col]

        if (inComment) {
          break
        }

        if (inQuote) {
          if (char === inQuote && line[col - 1] !== '\\') {
            inQuote = null
          } else {
            currentToken += char
          }
          continue
        }

        if (char === '"' || char === "'") {
          inQuote = char
          continue
        }

        if (char === '#') {
          inComment = true
          continue
        }

        if (char === '{') {
          if (currentToken.trim()) {
            tokens.push(currentToken.trim())
            currentToken = ''
          }

          if (tokens.length > 0) {
            const blockType = tokens[0]
            const blockArgs = tokens.slice(1)
            const newBlock: BlockContext = {
              type: blockType,
              args: blockArgs,
              parent: currentBlock,
              startLine: currentTokenLine || lineNum,
              directives: [],
              children: [],
            }
            currentBlock.children.push(newBlock)
            currentBlock = newBlock
          }
          tokens = []
          continue
        }

        if (char === '}') {
          if (currentToken.trim()) {
            tokens.push(currentToken.trim())
            currentToken = ''
          }
          if (tokens.length > 0) {
            currentBlock.directives.push({
              name: tokens[0],
              args: tokens.slice(1),
              line: currentTokenLine || lineNum,
            })
            tokens = []
          }

          if (currentBlock.parent) {
            currentBlock = currentBlock.parent
          }
          continue
        }

        if (char === ';') {
          if (currentToken.trim()) {
            tokens.push(currentToken.trim())
            currentToken = ''
          }
          if (tokens.length > 0) {
            const dirName = tokens[0]
            const dirArgs = tokens.slice(1)
            currentBlock.directives.push({
              name: dirName,
              args: dirArgs,
              line: currentTokenLine || lineNum,
            })

            // Handle include directives immediately during AST construction
            if (dirName === 'include' && dirArgs.length > 0) {
              this.handleInclude(dirArgs.join(' '), currentFile, result)
            }
          }
          tokens = []
          continue
        }

        if (/\s/.test(char)) {
          if (currentToken.trim()) {
            tokens.push(currentToken.trim())
            currentToken = ''
          }
          continue
        }

        if (currentToken === '') {
          currentTokenLine = lineNum
        }
        currentToken += char
      }

      if (currentToken.trim() && !inQuote) {
        tokens.push(currentToken.trim())
        currentToken = ''
      }
    }

    return rootBlock
  }

  private handleInclude(includePattern: string, currentFile: string, result: ParsedNginxConfig): void {
    const baseDir = dirname(currentFile)
    const patterns = includePattern.split(/\s+/)

    for (const pattern of patterns) {
      if (!pattern) continue
      const targetPattern = isAbsolute(pattern) ? pattern : resolve(baseDir, pattern)

      try {
        // If pattern has wildcards (* or ?)
        if (targetPattern.includes('*') || targetPattern.includes('?')) {
          const matchedFiles = this.simpleGlob(targetPattern)
          for (const matched of matchedFiles) {
            if (existsSync(matched)) {
              this.parseFileInternal(matched, result)
            }
          }
        } else {
          if (existsSync(targetPattern)) {
            this.parseFileInternal(targetPattern, result)
          }
        }
      } catch (err) {
        result.errors.push({
          file: currentFile,
          message: `Failed to process include "${pattern}": ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  }

  private simpleGlob(pattern: string): string[] {
    const dir = dirname(pattern)
    const filenamePattern = pattern.slice(dir.length + 1)
    if (!existsSync(dir)) return []

    const regexPattern = new RegExp(
      '^' + filenamePattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    )

    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      return entries
        .filter((e) => e.isFile() && regexPattern.test(e.name))
        .map((e) => resolve(dir, e.name))
    } catch {
      return []
    }
  }

  private extractEntities(
    context: BlockContext,
    sourceFile: string,
    result: ParsedNginxConfig
  ): void {
    if (context.type === 'server') {
      const serverBlock = this.buildServerBlock(context, sourceFile)
      if (serverBlock) {
        result.servers.push(serverBlock)
      }
    } else if (context.type === 'upstream') {
      const upstream = this.buildUpstream(context, sourceFile)
      if (upstream) {
        result.upstreams.push(upstream)
      }
    }

    for (const child of context.children) {
      this.extractEntities(child, sourceFile, result)
    }
  }

  private buildServerBlock(context: BlockContext, sourceFile: string): NginxServerBlock | null {
    let serverName = ''
    const listen: string[] = []
    const locations: NginxServerBlock['locations'] = []

    for (const dir of context.directives) {
      if (dir.name === 'server_name' && dir.args.length > 0) {
        serverName = dir.args.join(' ')
      } else if (dir.name === 'listen' && dir.args.length > 0) {
        listen.push(dir.args.join(' '))
      }
    }

    for (const child of context.children) {
      if (child.type === 'location') {
        const path = child.args.join(' ') || '/'
        let proxyPass: string | undefined
        let root: string | undefined
        let alias: string | undefined
        let returns: string | undefined

        for (const dir of child.directives) {
          if (dir.name === 'proxy_pass' && dir.args.length > 0) {
            proxyPass = dir.args[0]
          } else if (dir.name === 'root' && dir.args.length > 0) {
            root = dir.args.join(' ')
          } else if (dir.name === 'alias' && dir.args.length > 0) {
            alias = dir.args.join(' ')
          } else if (dir.name === 'return' && dir.args.length > 0) {
            returns = dir.args.join(' ')
          }
        }

        locations.push({
          path,
          proxyPass,
          root,
          alias,
          returns,
        })
      }
    }

    return {
      serverName: serverName || (listen.length > 0 ? `server:${listen[0]}` : 'localhost'),
      listen: listen.length > 0 ? listen : ['80'],
      locations,
      sourceFile,
      line: context.startLine,
    }
  }

  private buildUpstream(context: BlockContext, sourceFile: string): NginxUpstream | null {
    const name = context.args[0] || 'default_upstream'
    const servers: string[] = []

    for (const dir of context.directives) {
      if (dir.name === 'server' && dir.args.length > 0) {
        servers.push(dir.args[0])
      }
    }

    return {
      name,
      servers,
      sourceFile,
    }
  }
}
