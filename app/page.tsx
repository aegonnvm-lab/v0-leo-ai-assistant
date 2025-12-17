"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Mic, Activity, Zap, FileText, ImageIcon, Settings } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function LEOAssistant() {
  const [isListening, setIsListening] = useState(false)
  const [isWaitingForWakeWord, setIsWaitingForWakeWord] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [response, setResponse] = useState("")
  const [systemStatus, setSystemStatus] = useState({
    status: "Initializing...",
    cpu: 0,
    memory: 0,
  })

  const { toast } = useToast()
  const recognitionRef = useRef<any>(null)
  const wakeWordRecognitionRef = useRef<any>(null)
  const shouldListenForWakeWordRef = useRef(true)

  const speak = useCallback(
    (text: string) => {
      console.log("[v0] Attempting to speak:", text)

      if (!("speechSynthesis" in window)) {
        console.error("[v0] Speech synthesis not supported")
        toast({
          title: "Speech Not Supported",
          description: "Your browser doesn't support text-to-speech",
          variant: "destructive",
        })
        return
      }

      shouldListenForWakeWordRef.current = false
      if (wakeWordRecognitionRef.current) {
        try {
          wakeWordRecognitionRef.current.stop()
        } catch (e) {
          // Ignore errors
        }
      }

      window.speechSynthesis.cancel()

      setTimeout(() => {
        setIsSpeaking(true)
        setSystemStatus((prev) => ({ ...prev, status: "Speaking..." }))

        const utterance = new SpeechSynthesisUtterance(text)

        const voices = window.speechSynthesis.getVoices()
        const preferredVoice =
          voices.find((voice) => voice.name.includes("Google") && voice.lang.startsWith("en")) ||
          voices.find((voice) => voice.name.includes("Samantha")) ||
          voices.find((voice) => voice.name.includes("Daniel")) ||
          voices.find((voice) => voice.name.includes("Microsoft") && voice.lang.startsWith("en")) ||
          voices.find((voice) => voice.lang === "en-US") ||
          voices.find((voice) => voice.lang.startsWith("en")) ||
          voices[0]

        if (preferredVoice) {
          utterance.voice = preferredVoice
        }

        utterance.rate = 1.0
        utterance.pitch = 1.0
        utterance.volume = 1.0

        utterance.onstart = () => {
          console.log("[v0] Speech started")
        }

        utterance.onend = () => {
          console.log("[v0] Speech ended")
          setIsSpeaking(false)
          setSystemStatus((prev) => ({ ...prev, status: 'Listening for "Hey Leo"...' }))

          setTimeout(() => {
            shouldListenForWakeWordRef.current = true
            startWakeWordDetection()
          }, 500)
        }

        utterance.onerror = (event) => {
          if (event.error === "interrupted" || event.error === "canceled") {
            console.log("[v0] Speech was interrupted (expected)")
          } else {
            console.error("[v0] Speech error:", event.error)
          }
          setIsSpeaking(false)
          setSystemStatus((prev) => ({ ...prev, status: 'Listening for "Hey Leo"...' }))

          setTimeout(() => {
            shouldListenForWakeWordRef.current = true
            startWakeWordDetection()
          }, 500)
        }

        window.speechSynthesis.speak(utterance)
      }, 150)
    },
    [toast],
  )

  const processCommand = useCallback(
    async (command: string) => {
      console.log("[v0] Processing command:", command)
      setSystemStatus((prev) => ({ ...prev, status: "Processing with Gemini AI..." }))
      setResponse("Thinking...")

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: command }),
        })

        if (!res.ok) {
          throw new Error("Failed to get response from AI")
        }

        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let aiResponse = ""

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split("\n")

            for (const line of lines) {
              if (line.startsWith("0:")) {
                const content = line.slice(2).replace(/^"|"$/g, "")
                aiResponse += content
                setResponse(aiResponse)
              }
            }
          }
        }

        console.log("[v0] AI Response complete:", aiResponse)

        if (aiResponse.trim()) {
          setTimeout(() => {
            speak(aiResponse)
          }, 500)
        }

        toast({
          title: "Command Processed",
          description: "LEO has responded",
        })
      } catch (error) {
        console.error("[v0] Error processing command:", error)
        const errorMsg = "Sorry, I encountered an error processing your request."
        setResponse(errorMsg)
        setTimeout(() => {
          speak(errorMsg)
        }, 500)
        toast({
          title: "Error",
          description: "Failed to process command",
          variant: "destructive",
        })
      }

      setSystemStatus((prev) => ({ ...prev, status: 'Listening for "Hey Leo"...' }))
    },
    [speak, toast],
  )

  const startWakeWordDetection = useCallback(() => {
    if (!shouldListenForWakeWordRef.current || isSpeaking) {
      console.log("[v0] Skipping wake word detection (speaking or disabled)")
      return
    }

    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast({
        title: "Speech Recognition Not Supported",
        description: "Please use Chrome, Edge, or Safari",
        variant: "destructive",
      })
      return
    }

    if (wakeWordRecognitionRef.current) {
      try {
        wakeWordRecognitionRef.current.stop()
        wakeWordRecognitionRef.current = null
      } catch (e) {
        // Ignore errors
      }
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    recognition.onstart = () => {
      console.log("[v0] Wake word detection started")
      setIsWaitingForWakeWord(true)
      setSystemStatus((prev) => ({ ...prev, status: 'Listening for "Hey Leo"...' }))
    }

    recognition.onresult = (event: any) => {
      const current = event.resultIndex
      const transcript = event.results[current][0].transcript.toLowerCase().trim()
      console.log("[v0] Heard:", transcript)

      const wakeWords = ["hey leo", "hey leah", "hi leo", "ok leo", "helio", "hello leo", "yo leo", "leo"]

      const isWakeWord = wakeWords.some((word) => {
        return (
          transcript.includes(word) ||
          transcript.replace(/\s/g, "").includes(word.replace(/\s/g, "")) ||
          transcript.startsWith(word.split(" ")[0])
        )
      })

      if (isWakeWord) {
        console.log("[v0] Wake word detected! Transcript:", transcript)
        shouldListenForWakeWordRef.current = false
        recognition.stop()
        setIsWaitingForWakeWord(false)

        setTimeout(() => {
          speak("Yes, I'm listening")
          setTimeout(() => {
            startCommandRecognition()
          }, 2000)
        }, 100)

        toast({
          title: "LEO Activated",
          description: "Listening for your command...",
        })
      }
    }

    recognition.onerror = (event: any) => {
      console.log("[v0] Wake word error:", event.error)
      if (event.error !== "no-speech" && event.error !== "aborted" && shouldListenForWakeWordRef.current) {
        setTimeout(() => {
          if (shouldListenForWakeWordRef.current) {
            console.log("[v0] Restarting wake word detection after error...")
            startWakeWordDetection()
          }
        }, 1000)
      }
    }

    recognition.onend = () => {
      console.log("[v0] Wake word recognition ended")
      if (isWaitingForWakeWord && shouldListenForWakeWordRef.current && !isSpeaking) {
        setTimeout(() => {
          if (shouldListenForWakeWordRef.current) {
            console.log("[v0] Restarting wake word detection...")
            startWakeWordDetection()
          }
        }, 500)
      }
    }

    try {
      recognition.start()
      wakeWordRecognitionRef.current = recognition
    } catch (error) {
      console.error("[v0] Error starting wake word detection:", error)
    }
  }, [isWaitingForWakeWord, isSpeaking, speak, toast])

  const startCommandRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = "en-US"
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      console.log("[v0] Command recognition started")
      setIsListening(true)
      setTranscript("")
      setSystemStatus((prev) => ({ ...prev, status: "Listening for command..." }))
    }

    recognition.onresult = (event: any) => {
      let interimTranscript = ""
      let finalTranscript = ""

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      setTranscript(finalTranscript || interimTranscript)

      if (finalTranscript) {
        console.log("[v0] Final command received:", finalTranscript)
        processCommand(finalTranscript)
      }
    }

    recognition.onerror = (event: any) => {
      console.error("[v0] Command recognition error:", event.error)
      setIsListening(false)
      setIsWaitingForWakeWord(true)
      shouldListenForWakeWordRef.current = true
      setTimeout(() => startWakeWordDetection(), 500)
    }

    recognition.onend = () => {
      console.log("[v0] Command recognition ended")
      setIsListening(false)
      setIsWaitingForWakeWord(true)
    }

    recognition.start()
    recognitionRef.current = recognition
  }, [processCommand, startWakeWordDetection])

  useEffect(() => {
    console.log("[v0] Initializing LEO Assistant...")

    if ("speechSynthesis" in window) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices()
        console.log("[v0] Loaded voices:", voices.length)
      }

      loadVoices()
      window.speechSynthesis.onvoiceschanged = loadVoices
    }

    const timer = setTimeout(() => {
      startWakeWordDetection()
    }, 1000)

    const metricsInterval = setInterval(() => {
      setSystemStatus((prev) => ({
        ...prev,
        cpu: Math.floor(Math.random() * 30 + 20),
        memory: Math.floor(Math.random() * 40 + 30),
      }))
    }, 2000)

    return () => {
      clearTimeout(timer)
      clearInterval(metricsInterval)
      shouldListenForWakeWordRef.current = false
      if (wakeWordRecognitionRef.current) {
        wakeWordRecognitionRef.current.stop()
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [startWakeWordDetection])

  const handleButtonAction = (action: string) => {
    console.log("[v0] Button action:", action)
    const message = `${action} feature activated`
    setResponse(message)
    speak(message)
    toast({
      title: action,
      description: message,
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 text-white p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Zap className="h-6 w-6 text-purple-400" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              LEO
            </h1>
          </div>
          <p className="text-lg text-purple-300">Advanced AI Operating Layer</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Badge variant="outline" className="border-green-500/50 text-green-400">
              <Activity className="h-3 w-3 mr-1" />
              Online
            </Badge>
            <Badge variant="outline" className="border-purple-500/50 text-purple-400">
              Voice Active
            </Badge>
            <Badge variant="outline" className="border-blue-500/50 text-blue-400">
              Gemini AI
            </Badge>
          </div>
        </div>

        {/* Voice Indicator */}
        <div className="flex flex-col items-center justify-center gap-6">
          <div
            className={`relative h-32 w-32 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? "bg-red-500/20 ring-4 ring-red-500/50 animate-pulse"
                : isSpeaking
                  ? "bg-blue-500/20 ring-4 ring-blue-500/50 animate-pulse"
                  : "bg-purple-500/20 ring-4 ring-purple-500/50"
            }`}
          >
            <Mic
              className={`h-16 w-16 transition-colors ${
                isListening ? "text-red-400" : isSpeaking ? "text-blue-400" : "text-purple-400"
              }`}
            />
            {(isWaitingForWakeWord || isListening) && (
              <div className="absolute inset-0 rounded-full bg-purple-500/10 animate-ping" />
            )}
          </div>

          <div className="text-center space-y-2">
            <p className="text-xl font-semibold text-purple-300">{systemStatus.status}</p>
            <p className="text-sm text-purple-400/70">
              {isWaitingForWakeWord
                ? 'Say "Hey Leo" to activate'
                : isListening
                  ? "Listening..."
                  : isSpeaking
                    ? "Speaking..."
                    : "Processing..."}
            </p>
          </div>
        </div>

        {/* Transcript Display */}
        {transcript && (
          <div className="max-w-2xl mx-auto p-6 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <p className="text-sm text-purple-400 mb-2">You said:</p>
            <p className="text-lg text-white">{transcript}</p>
          </div>
        )}

        {/* Response Display */}
        {response && (
          <div className="max-w-2xl mx-auto p-6 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm text-blue-400 mb-2">LEO responds:</p>
            <p className="text-lg text-white">{response}</p>
          </div>
        )}

        {/* System Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <p className="text-sm text-purple-400">CPU Usage</p>
            <p className="text-2xl font-bold text-white">{systemStatus.cpu}%</p>
          </div>
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm text-blue-400">Memory</p>
            <p className="text-2xl font-bold text-white">{systemStatus.memory}%</p>
          </div>
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <p className="text-sm text-green-400">Status</p>
            <p className="text-2xl font-bold text-white">Active</p>
          </div>
          <div className="p-4 rounded-lg bg-pink-500/10 border border-pink-500/20">
            <p className="text-sm text-pink-400">Mode</p>
            <p className="text-2xl font-bold text-white">Voice</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          <Button
            onClick={() => handleButtonAction("AI Chat")}
            className="h-24 flex flex-col gap-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50"
          >
            <Activity className="h-6 w-6" />
            <span>AI Chat</span>
          </Button>
          <Button
            onClick={() => handleButtonAction("Document Generation")}
            className="h-24 flex flex-col gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50"
          >
            <FileText className="h-6 w-6" />
            <span>Documents</span>
          </Button>
          <Button
            onClick={() => handleButtonAction("Image Creation")}
            className="h-24 flex flex-col gap-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50"
          >
            <ImageIcon className="h-6 w-6" />
            <span>Images</span>
          </Button>
          <Button
            onClick={() => handleButtonAction("System Control")}
            className="h-24 flex flex-col gap-2 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/50"
          >
            <Settings className="h-6 w-6" />
            <span>System</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
