import { streamText } from "ai"

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { prompt, context } = await req.json()

    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 })
    }

    const fullPrompt = context ? `${context}\n\nUser: ${prompt}\n\nAssistant:` : prompt

    const result = await streamText({
      model: "google/gemini-2.0-flash",
      prompt: fullPrompt,
      maxOutputTokens: 500,
      temperature: 0.7,
    })

    // Get the full text from the stream
    let fullText = ""
    for await (const chunk of result.textStream) {
      fullText += chunk
    }

    return Response.json({ text: fullText })
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    return Response.json(
      { error: "Failed to process request", text: "Sorry, I encountered an error. Please try again." },
      { status: 500 },
    )
  }
}
