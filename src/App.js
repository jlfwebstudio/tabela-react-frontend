import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faFilter, faSearch, faUpload, faFileExcel, faSort } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc'); // Ordenação padrão: mais antigo para mais recente
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({
    'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
  });
  const [activeFilterColumn, setActiveFilterColumn] = useState(null);

  const filterDropdownRef = useRef(null);

  // Define os cabeçalhos da tabela na ordem desejada
  // Memória: "User wants uploaded Mob data to retain all original columns, map Origem to "mob", Cliente to Nome Cliente, Contratante to Getnet/Punto, enforce DD/MM/YYYY dates, and follow a specific column order."
  // Os cabeçalhos aqui já estão na ordem preferida.
  const defaultTableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
    // 'Origem' // Se a coluna Origem for adicionada, ela deve ser incluída aqui.
  ], []);

  // Normaliza strings para comparação (remove acentos, caixa baixa, espaços extras)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string' && str !== null && str !== undefined) return String(str);
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }, []);

  // Função para parsear a data no formato DD/MM/YYYY para um objeto Date
  // Memória: "User prefers all date fields displayed as DD/MM/YYYY without time components."
  // Memória: "User wants dates used exactly as provided by the system without any inversion logic..."
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    // Garante que a data seja tratada como DD/MM/YYYY, ignorando qualquer hora
    // split(' ')[0] para pegar apenas a parte da data, caso haja hora
    const parts = dateString.split(' ')[0].split('/');
    if (parts.length !== 3) return null; // Garante que a data está no formato esperado
    const [day, month, year] = parts.map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0); // Zera a hora para comparações precisas
    return isNaN(date.getTime()) ? null : date;
  }, []);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna original se não puder ser formatado
  }, [parseDateForComparison]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Formata a data de hoje para o nome do arquivo Excel
  const todayFormatted = useMemo(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  // Verifica se a OS está atrasada
  // Memória: "User wants the overdue counter to count all rows with Data Limite earlier than now, regardless of justification."
  // Memória: "User wants rows with past due dates highlighted in red..."
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite < today;
  }, [parseDateForComparison, today]);

  // Verifica se a OS vence hoje
  // Memória: "User wants rows with today’s due date to be highlighted in a subtle yellow background"
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // Determina a classe CSS da linha com base no status e data
  // Memória: "User prefers a stronger, more intense red for all overdue rows, including those marked “Falta Abonar”, to improve visibility."
  // Memória: "User prefers table row background colors to have higher contrast with text for better readability."
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho intenso para atrasado
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    return 'row-default-blue'; // Azul claro para os demais
  }, [isOverdue, isDueToday]);


  // Estilo para a célula "Justificativa do Abono"
  // Memória: "User wants empty justification cells past due highlighted in purple with the text “Falta Abonar”."
  // Memória: "User wants the ABONAR cell to stay purple regardless of row background color"
  // Memória: "User prefers the red background of rows with “Falta Abonar” cells to be less intense, matching the overall table color scheme." (Esta memória parece contradizer "ABONAR cell to stay purple regardless of row background color" e "stronger, more intense red for all overdue rows". Vamos priorizar o roxo para "Falta Abonar" e vermelho intenso para a linha atrasada, com o roxo sobrescrevendo a célula específica.)
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      // Retorna o estilo roxo para a célula "FALTA ABONAR"
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {}; // Retorna objeto vazio para não aplicar estilo se a condição não for atendida
  }, [isOverdue, normalizeForComparison]);

  // Texto para a célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);


  // Função para obter opções de filtro para uma coluna
  const getColumnFilterOptions = useCallback((columnName) => {
    const options = new Set();
    data.forEach(row => {
      if (row[columnName]) {
        options.add(row[columnName]);
      }
    });
    return Array.from(options).sort((a, b) => String(a).localeCompare(String(b)));
  }, [data]);

  // Efeito para popular os cabeçalhos e opções de filtro quando os dados mudam
  useEffect(() => {
    if (data.length > 0) {
      setTableHeaders(defaultTableHeaders);
      const newFilterOptions = {};
      defaultTableHeaders.forEach(header => {
        newFilterOptions[header] = getColumnFilterOptions(header);
      });
      setFilterOptions(newFilterOptions);
    } else {
      setTableHeaders([]);
      setFilterOptions({});
    }
  }, [data, defaultTableHeaders, getColumnFilterOptions]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  // Memória: "User wants filter dropdown to close when clicking outside the filter window or when opening another filter."
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Verifica se o clique não foi dentro de nenhum dropdown de filtro
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
    setData([]); // Limpa os dados anteriores ao selecionar novo arquivo
    setSortColumn('Data Limite'); // Reseta a ordenação
    setSortDirection('asc'); // Reseta a direção para ascendente
    setSelectedFilterOptions({ // Reseta os filtros de status para o padrão
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao fazer upload do arquivo.');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Erro:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Memória: "User wants the filter dropdown to appear above the table and the Data Limite column sorted in ascending order."
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc'); // Padrão ao mudar de coluna
    }
  }, [sortColumn, sortDirection]);

  // Memória: "User wants a search input (magnifying glass) to filter table rows instead of using browser Ctrl+F"
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  // Memória: "User wants the filter dropdown completely rebuilt to ensure correct positioning and reliable functionality."
  // Memória: "User wants filter dropdown to close when clicking outside the filter window or when opening another filter."
  // Memória: "User prefers the filter dropdown to appear above the table, not hidden behind it"
  const toggleFilterDropdown = useCallback((columnName) => {
    // Se o mesmo filtro for clicado, fecha. Se outro for clicado, abre o novo.
    setActiveFilterColumn(activeFilterColumn === columnName ? null : columnName);
  }, [activeFilterColumn]);

  const handleFilterOptionChange = useCallback((columnName, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[columnName] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [columnName]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [columnName]: [...currentOptions, option]
        };
      }
    });
  }, []);

  const applyColumnFilter = useCallback(() => {
    // A filtragem é aplicada automaticamente via useMemo filteredAndSortedData
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  const clearColumnFilter = useCallback((columnName) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [columnName]: [] // Limpa todas as opções selecionadas para esta coluna
    }));
    setActiveFilterColumn(null); // Fecha o dropdown após limpar
  }, []);

  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // 1. Filtragem por termo de busca global
    // Memória: "User wants a search input (magnifying glass) to filter table rows instead of using browser Ctrl+F"
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header => {
          const cellValue = row[header];
          // Garante que o valor da célula seja uma string antes de normalizar
          return normalizeForComparison(cellValue).includes(normalizedSearchTerm);
        })
      );
    }

    // 2. Filtragem por colunas (dropdowns)
    // Memória: "User wants only statuses Encaminhado, Em transferência, Em campo, Reencaminhado, Procedimento Técnico visible and exported."
    filteredData = filteredData.filter(row => {
      return Object.entries(selectedFilterOptions).every(([column, selectedOptions]) => {
        if (selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        const rowValue = row[column];
        // Verifica se o valor da linha está entre as opções selecionadas
        return selectedOptions.includes(rowValue);
      });
    });

    // 3. Ordenação
    if (sortColumn) {
      filteredData = [...filteredData].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Tratamento especial para Data Limite
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (dateA && dateB) {
            return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          // Lida com datas nulas ou inválidas, colocando-as no final
          if (!dateA && dateB) return sortDirection === 'asc' ? 1 : -1;
          if (dateA && !dateB) return sortDirection === 'asc' ? -1 : 1;
          return 0;
        }

        // Tratamento para outros tipos de dados (string, number)
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
        // Fallback para outros tipos ou valores indefinidos
        return 0;
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  // Contador de pendentes hoje (atrasados ou vencendo hoje)
  // Memória: "User wants the overdue counter to count all rows with Data Limite earlier than now, regardless of justification."
  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [filteredAndSortedData, isOverdue, isDueToday]);

  // Função de exportação para Excel
  // Memória: "User wants exported Excel sheets to include only today’s pending items (overdue and due today) while preserving table colors."
  // Memória: "User prefers code to avoid undefined variables and lint errors that block production builds"
  // Memória: "User wants exported Excel files to have enhanced visual presentation, including richer formatting, colors, and optional graphics for a more professional look."
  const exportToExcel = useCallback(() => {
    // Filtra os dados para exportação: apenas itens atrasados ou vencendo hoje
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há itens atrasados ou vencendo hoje para exportar.');
      return;
    }

    // Cria uma nova folha de trabalho. Usamos skipHeader: true porque adicionaremos os cabeçalhos manualmente com estilos.
    const ws = XLSX.utils.json_to_sheet(filteredForExport, { skipHeader: true });

    // Adiciona os cabeçalhos na primeira linha (A1, B1, etc.)
    XLSX.utils.sheet_add_aoa(ws, [tableHeaders], { origin: 'A1' });

    // --- Estilos Padrão ---
    // Estilo base para cabeçalhos
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 11 }, // Fonte e tamanho padrão do Excel
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro para cabeçalhos, correspondendo ao CSS
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    // Estilo base para células de dados
    const baseCellStyle = {
      font: { name: "Calibri", sz: 11 }, // Fonte e tamanho padrão para dados
      alignment: { vertical: "center", wrapText: false }, // Alinhamento vertical padrão, sem quebra de texto
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    // --- Aplicação de Estilos ---

    // Aplica estilos aos cabeçalhos (linha 1)
    tableHeaders.forEach((header, index) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index }); // r: 0 para a primeira linha (cabeçalhos)
      // Garante que a célula exista antes de atribuir o estilo
      if (!ws[cellAddress]) ws[cellAddress] = {};
      ws[cellAddress].s = headerStyle;
    });

    // Aplica estilos às células de dados (a partir da linha 2 do Excel)
    for (let R = 0; R < filteredForExport.length; R++) {
      const rowData = filteredForExport[R];
      const rowClass = getRowClass(rowData); // Obtém a classe da linha para determinar a cor
      // Memória: "User wants empty justification cells past due highlighted in purple with the text “Falta Abonar”."
      // Memória: "User wants the ABONAR cell to stay purple regardless of row background color"
      const isAbonarCondition = isOverdue(rowData) && (normalizeForComparison(rowData['Justificativa do Abono']) === 'falta abonar' || normalizeForComparison(rowData['Justificativa do Abono']) === '');

      for (let C = 0; C < tableHeaders.length; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: R + 1, c: C }); // +1 para pular o cabeçalho
        const header = tableHeaders[C];
        let cellValue = rowData[header]; // Valor original da célula

        // Cria uma cópia do estilo base para cada célula para evitar referências
        let cellStyle = { ...baseCellStyle };

        // Aplica cor de fundo da linha (vermelho, amarelo, azul claro)
        if (rowClass === 'row-overdue') {
          cellStyle.fill = { fgColor: { rgb: "C00000" } }; // Vermelho intenso
          cellStyle.font = { ...cellStyle.font, color: { rgb: "FFFFFF" } }; // Texto branco
        } else if (rowClass === 'row-due-today') {
          cellStyle.fill = { fgColor: { rgb: "FFC000" } }; // Amarelo
          cellStyle.font = { ...cellStyle.font, color: { rgb: "000000" } }; // Texto preto
        } else {
          cellStyle.fill = { fgColor: { rgb: "E0F2F7" } }; // Azul claro
          cellStyle.font = { ...cellStyle.font, color: { rgb: "000000" } }; // Texto preto
        }

        // --- Formatação Específica por Coluna ---

        // Memória: "User wants empty justification cells past due highlighted in purple with the text “Falta Abonar”."
        // Memória: "User wants the ABONAR cell to stay purple regardless of row background color"
        if (header === 'Justificativa do Abono' && isAbonarCondition) {
          cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo intenso
          cellStyle.font = { ...cellStyle.font, color: { rgb: "FFFFFF" }, bold: true }; // Texto branco e negrito
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" }; // Centraliza o texto "FALTA ABONAR"
          cellValue = 'FALTA ABONAR'; // Garante que o texto seja "FALTA ABONAR" no Excel
        }
        // Memória: "User prefers CNPJ/CPF values to be displayed without an equals sign and without surrounding quotation marks."
        else if (header === 'CNPJ / CPF') {
          cellStyle.numFmt = '@'; // Formato de texto para evitar que o Excel interprete como número
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "left" }; // Alinhar à esquerda para texto
          // Remove '=', aspas e garante que seja apenas dígitos
          if (typeof cellValue === 'string') {
            cellValue = cellValue.replace(/['"=]/g, '').trim();
          }
        }
        // Memória: "User prefers all date fields displayed as DD/MM/YYYY without time components."
        else if (header === 'Data Limite') {
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" }; // Centraliza a data
          const dateObj = parseDateForComparison(cellValue);
          if (dateObj) {
            // Converte a data para o formato numérico do Excel e aplica o formato DD/MM/YYYY
            const excelDate = Math.floor(dateObj.getTime() / (1000 * 60 * 60 * 24) + 25569); // 25569 é a base para 1/1/1970 no Excel
            ws[cellAddress] = { v: excelDate, t: 'n', s: { ...cellStyle, numFmt: 'DD/MM/YYYY' } };
          } else {
            // Se a data for inválida, exporta como string com o formato original
            ws[cellAddress] = { v: cellValue, t: 's', s: cellStyle };
          }
          // Pula a atribuição padrão no final do loop para esta célula
          continue;
        }
        // Memória: "User wants the Serviço and Técnico columns to always display correct data and related features..."
        // Memória: "User wants full service names displayed in the table."
        else if (header === 'Serviço' || header === 'Técnico' || header === 'Cliente' || header === 'Contratante' || header === 'Prestador' || header === 'Cidade') {
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "left" }; // Alinha texto à esquerda
        } else {
          // Alinhamento padrão para outras colunas (ex: Chamado, Numero Referencia, Status)
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" };
        }

        // Garante que a célula exista e atribui o valor e o estilo
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].v = cellValue;
        ws[cellAddress].s = cellStyle;
        ws[cellAddress].t = typeof cellValue === 'number' ? 'n' : 's'; // Define o tipo da célula (number ou string)
      }
    }

    // --- Ajuste de Largura das Colunas ---
    // Memória: "User prefers all table columns to be wider, allowing horizontal scroll for a better interface."
    // Memória: "User prefers adjusting column widths to reduce excess space, especially narrowing reference number column, and wants full service names displayed in the table."
    // Memória: "User prefers slightly wider CPF/CNPJ column to avoid line breaks, adjusting width minimally while keeping overall layout compact."
    // Memória: "User prefers the city column to be slightly wider to avoid line breaks."
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão razoável
      if (header === 'Serviço') width = 35; // Mais largo para nomes completos
      else if (header === 'Justificativa do Abono') width = 45; // Mais largo para a justificativa
      else if (header === 'Contratante' || header === 'Cliente' || header === 'Técnico' || header === 'Prestador') width = 28;
      else if (header === 'CNPJ / CPF') width = 22; // Ligeiramente mais largo
      else if (header === 'Numero Referencia') width = 20; // Ajustado para evitar quebras
      else if (header === 'Chamado') width = 18;
      else if (header === 'Status') width = 20;
      else if (header === 'Cidade') width = 20; // Ligeiramente mais largo
      else if (header === 'Data Limite') width = 18;
      return { wch: width }; // wch = width in characters
    });
    ws['!cols'] = wscols;

    // --- Funcionalidades Adicionais do Excel ---

    // Adiciona AutoFiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congela a primeira linha (cabeçalhos)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    // Cria o workbook e adiciona a folha
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes");

    // Define a cor da aba (sheet tab)
    // Garante que a estrutura do workbook.Views exista
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [];
    if (!wb.Workbook.Views[0]) wb.Workbook.Views[0] = {};
    // Define a cor da aba para o primeiro sheet
    wb.Workbook.Views[0].TabColor = { rgb: "4472C4" }; // Cor azul escuro para a aba

    // Escreve o arquivo Excel
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, isOverdue, isDueToday, tableHeaders, getRowClass, normalizeForComparison, formatDataLimite, parseDateForComparison, todayFormatted]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de OSs</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
            {file && <span className="file-name">{file.name}</span>}
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar em toda a tabela..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
            </button>
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="th-content">
                      <div className="header-text" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header ? (
                          sortDirection === 'asc' ? (
                            <FontAwesomeIcon icon={faSortUp} className="sort-icon" />
                          ) : (
                            <FontAwesomeIcon icon={faSortDown} className="sort-icon" />
                          )
                        ) : (
                          <FontAwesomeIcon icon={faSort} className="sort-icon inactive" />
                        )}
                      </div>
                      {/* Memória: "User wants the filter dropdown completely rebuilt to ensure correct positioning and reliable functionality." */}
                      {/* Memória: "User prefers the filter dropdown to appear above the table, not hidden behind it" */}
                      {/* O posicionamento "above the table" é geralmente controlado por CSS (z-index, position: absolute/relative). */}
                      {/* A ref `filterDropdownRef` está no container do ícone, o que é bom para detectar cliques fora. */}
                      <div className="filter-icon-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown">
                            <div className="filter-options-container">
                              {filterOptions[header] && filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={(selectedFilterOptions[header] || []).includes(option)}
                                    onChange={() => handleFilterOptionChange(header, option)}
                                  />
                                  {option}
                                </label>
                              ))}
                            </div>
                            <div className="filter-actions">
                              <button onClick={applyColumnFilter}>Aplicar</button>
                              <button onClick={() => clearColumnFilter(header)}>Limpar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClass(row)}>
                  {tableHeaders.map(header => (
                    <td
                      key={header}
                      className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}
                      style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                    >
                      {header === 'Justificativa do Abono'
                        ? getJustificativaCellText(row)
                        : header === 'Data Limite'
                          ? formatDataLimite(row[header])
                          : header === 'CNPJ / CPF'
                            ? String(row[header] || '').replace(/['"=]/g, '').trim() // Remove '=' e aspas
                            : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
