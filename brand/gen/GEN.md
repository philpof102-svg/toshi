# Painted Toshi PFPs — the FLUX pipeline

The flat vector set in `brand/out/` is the *character source of truth*; these are the painted,
X-PFP-grade renders Phil actually asked for. Generated on the FLUX.1-schnell HuggingFace Space
via its public Gradio API (the HF MCP connector has invoke disabled — `gradio=none`).

    POST https://evalstate-flux1-schnell.hf.space/gradio_api/call/infer  {"data":[PROMPT,0,true,1024,1024,4]}
    GET  …/call/infer/<event_id>   → SSE ending in the image URL

Shared character block (keeps the cat the same across themes):

    Chibi mascot cat, oversized round head and small body, cobalt blue fur, light blue inner
    ears, wide white muzzle and chest, big glossy expressive eyes, thick dark navy outlines,
    airbrushed digital painting, collectible PFP avatar art, centered portrait

Then one theme clause per portrait (agent 007 barrel / Matrix code rain / kimono+visor merchant /
night keeper / notary seal / ink enso). Full batch script lives in the session scratchpad
(`gen-batch.sh`) — anonymous ZeroGPU quota allows ~3 images per refill window; with an HF token
in `HF_TOKEN` the logged-in quota clears the whole set in one run.

Provenance: model-generated (FLUX.1-schnell) from our own prompts — unlike `brand/out/`, these
are NOT hand-drawn. Say so if asked.
