import { useState, useCallback } from "react";

type ToastVariant = "success" | "error";

interface UseToastReturn {
  toastMessage: string;
  toastVariant: ToastVariant;
  isToastVisible: boolean;
  showToast: (message: string, variant: ToastVariant) => void;
  hideToast: () => void;
}

export function useToast(): UseToastReturn {
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState<ToastVariant>("success");
  const [isToastVisible, setIsToastVisible] = useState(false);

  const showToast = useCallback(
    (message: string, variant: ToastVariant): void => {
      setToastMessage(message);
      setToastVariant(variant);
      setIsToastVisible(true);
    },
    [],
  );

  const hideToast = useCallback((): void => {
    setIsToastVisible(false);
  }, []);

  return { toastMessage, toastVariant, isToastVisible, showToast, hideToast };
}
