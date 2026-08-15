import React, { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";

import client from "@/api/client";

function FallbackIcon() {
  return <BookOpen className="h-16 w-16 text-primary/30" aria-hidden="true" />;
}

export default function BookThumbnail({ book }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!book?.thumbnail_url) {
      setObjectUrl(null);
      setFailed(false);
      return undefined;
    }
    const controller = new AbortController();
    let localUrl = null;
    setObjectUrl(null);
    setFailed(false);

    client.get(book.thumbnail_url, { responseType: "blob", signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        localUrl = URL.createObjectURL(data);
        setObjectUrl(localUrl);
      })
      .catch((error) => {
        if (!controller.signal.aborted && error?.code !== "ERR_CANCELED") setFailed(true);
      });

    return () => {
      controller.abort();
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [book?.thumbnail_url]);

  if (objectUrl && !failed) {
    return (
      <img
        src={objectUrl}
        alt={`First page of ${book?.title || "uploaded document"}`}
        className="h-full w-full object-cover object-top"
        onError={() => setFailed(true)}
      />
    );
  }

  if (book?.thumbnail_url && !failed) {
    return <div className="h-full w-full animate-pulse bg-muted" aria-label="Loading document preview" />;
  }

  if (book?.thumbnail_status === "processing") {
    return <div className="h-full w-full animate-pulse bg-muted" aria-label="Generating document preview" />;
  }

  return <FallbackIcon />;
}
