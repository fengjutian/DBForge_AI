import * as net from 'net'
import * as fs from 'fs'
import { Client as SSHClient } from 'ssh2'
import type { SSHTunnelConfig } from '@dbforge/shared'

// ============================================================
// SSHTunnel — manages SSH tunnels keyed by connection ID
// ============================================================

interface TunnelEntry {
  client: SSHClient
  server: net.Server
  localPort: number
}

interface TunnelAddress {
  localHost: string
  localPort: number
}

class SSHTunnel {
  private static instance: SSHTunnel | null = null
  private tunnels: Map<string, TunnelEntry> = new Map()

  private constructor() {}

  static getInstance(): SSHTunnel {
    if (!SSHTunnel.instance) {
      SSHTunnel.instance = new SSHTunnel()
    }
    return SSHTunnel.instance
  }

  /**
   * Create an SSH tunnel for the given connection ID.
   * Returns the local forwarding address { localHost, localPort }.
   * If a tunnel already exists for this ID, returns its address.
   */
  async createTunnel(
    connectionId: string,
    config: SSHTunnelConfig,
    remoteHost: string,
    remotePort: number
  ): Promise<TunnelAddress> {
    // Reuse existing tunnel if already established
    const existing = this.tunnels.get(connectionId)
    if (existing) {
      return { localHost: '127.0.0.1', localPort: existing.localPort }
    }

    const localPort = await this.getFreePort()
    const client = new SSHClient()

    await new Promise<void>((resolve, reject) => {
      client.on('ready', () => {
        const server = net.createServer((localSocket) => {
          client.forwardOut(
            '127.0.0.1',
            localSocket.remotePort ?? 0,
            remoteHost,
            remotePort,
            (err, stream) => {
              if (err) {
                localSocket.destroy()
                return
              }
              localSocket.pipe(stream)
              stream.pipe(localSocket)
              stream.on('close', () => localSocket.destroy())
              localSocket.on('close', () => stream.destroy())
              localSocket.on('error', () => stream.destroy())
              stream.on('error', () => localSocket.destroy())
            }
          )
        })

        server.listen(localPort, '127.0.0.1', () => {
          this.tunnels.set(connectionId, { client, server, localPort })
          resolve()
        })

        server.on('error', (err) => {
          client.end()
          reject(err)
        })
      })

      client.on('error', (err) => {
        reject(err)
      })

      // Build connect config
      const connectConfig: Parameters<SSHClient['connect']>[0] = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 10000
      }

      if (config.authType === 'privateKey') {
        if (!config.privateKeyPath) {
          reject(new Error('privateKeyPath is required for privateKey auth'))
          return
        }
        try {
          connectConfig.privateKey = fs.readFileSync(config.privateKeyPath)
        } catch (err) {
          reject(new Error(`Failed to read private key file: ${(err as Error).message}`))
          return
        }
        if (config.password) {
          // passphrase for encrypted private key
          connectConfig.passphrase = config.password
        }
      } else {
        connectConfig.password = config.password
      }

      client.connect(connectConfig)
    })

    return { localHost: '127.0.0.1', localPort }
  }

  /**
   * Close and release the SSH tunnel for the given connection ID.
   */
  async closeTunnel(connectionId: string): Promise<void> {
    const entry = this.tunnels.get(connectionId)
    if (!entry) return

    this.tunnels.delete(connectionId)

    await new Promise<void>((resolve) => {
      entry.server.close(() => resolve())
      entry.client.end()
    })
  }

  /**
   * Close all active tunnels.
   */
  async closeAll(): Promise<void> {
    const ids = Array.from(this.tunnels.keys())
    await Promise.all(ids.map((id) => this.closeTunnel(id)))
  }

  /**
   * Check whether a tunnel is active for the given connection ID.
   */
  hasTunnel(connectionId: string): boolean {
    return this.tunnels.has(connectionId)
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /** Allocate a free local TCP port by binding to port 0. */
  private getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer()
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          server.close()
          reject(new Error('Failed to get free port'))
          return
        }
        const port = address.port
        server.close(() => resolve(port))
      })
      server.on('error', reject)
    })
  }
}

export const sshTunnel = SSHTunnel.getInstance()
export default sshTunnel
