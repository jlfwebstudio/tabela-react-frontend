// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
// REMOVIDO: import { saveAs } from 'file-saver'; // 'saveAs' não é mais usada diretamente
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faSort, faFilter, faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite'); // Inicializa com 'Data Limite'
  const [sortDirection, setSortDirection] = useState('asc'); // Inicializa com 'asc' (mais antigo para mais novo)
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({}); // Estado para opções de filtro selecionadas
  const filterDropdownRef = useRef(null);

  // Variáveis de ambiente
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // Cabeçalhos da tabela na ordem desejada
  const tableHeaders = useMemo(() => [
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
  ], []);

  // Status permitidos para o filtro permanente
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO',
  ], []);

  // Função utilitária para normalizar strings para comparação (ignora acentos e caixa)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string' && str !== null && str !== undefined) return String(str); // Converte para string se não for
    if (typeof str !== 'string') return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }, []);

  // Função para formatar a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const parts = dateString.split('/');
    if (parts.length === 3) {
      // Garante que a data seja interpretada como DD/MM/YYYY
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      // Verifica se a data é válida antes de formatar
      if (!isNaN(date.getTime())) {
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      }
    }
    return dateString; // Retorna original se não for um formato DD/MM/YYYY válido
  }, []);

  // Função para parsear a data para comparação (YYYY-MM-DD)
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10); // Mês já é 1-indexado aqui
      const year = parseInt(parts[2], 10);
      // Cria uma string no formato YYYY-MM-DD para comparação
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }, []);

  // Função para lidar com a seleção do arquivo
  const handleFileChange = useCallback((e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
      setData([]); // Limpa os dados anteriores ao selecionar um novo arquivo
      setSortColumn('Data Limite'); // Reseta a ordenação para o padrão
      setSortDirection('asc');
      setSearchTerm(''); // Reseta a pesquisa
      setOpenFilterDropdown(null); // Fecha qualquer dropdown de filtro
      setSelectedFilterOptions({}); // Reseta os filtros de coluna
    } else {
      setFile(null);
      setFileName('');
    }
  }, []);

  // Função para processar o upload do CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa os dados antes de um novo upload

    const formData = new FormData();
    formData.append('csvFile', file);

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
      if (!Array.isArray(result) || result.length === 0) {
        setError('O arquivo CSV está vazio ou não contém dados válidos.');
        setData([]);
      } else {
        // Filtro permanente por status
        const filteredByStatus = result.filter(row =>
          allowedStatuses.some(status =>
            normalizeForComparison(row.Status || '') === normalizeForComparison(status)
          )
        );
        setData(filteredByStatus);
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro no upload: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, allowedStatuses, normalizeForComparison]);

  // Lógica de ordenação
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Lógica de filtro de coluna
  const toggleFilterDropdown = useCallback((header) => {
    setOpenFilterDropdown(openFilterDropdown === header ? null : header);
  }, [openFilterDropdown]);

  const handleFilterOptionChange = useCallback((header, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [header]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [header]: [...currentOptions, option]
        };
      }
    });
  }, []);

  const applyColumnFilter = useCallback(() => {
    setOpenFilterDropdown(null); // Fecha o dropdown após aplicar
  }, []);

  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: []
    }));
    setOpenFilterDropdown(null); // Fecha o dropdown após limpar
  }, []);

  // Fechar dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) && !event.target.closest('.filter-icon')) {
        setOpenFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Lógica de filtragem e ordenação dos dados
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // 1. Filtro de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header] || '').includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtros de coluna
    Object.keys(selectedFilterOptions).forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        filteredData = filteredData.filter(row =>
          selectedOptions.includes(row[header] || '')
        );
      }
    });

    // 3. Ordenação
    if (sortColumn) {
      filteredData = [...filteredData].sort((a, b) => {
        const aValue = a[sortColumn] || '';
        const bValue = b[sortColumn] || '';

        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (dateA === null && dateB === null) return 0;
          if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
          if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc'
            ? dateA.localeCompare(dateB)
            : dateB.localeCompare(dateA);
        } else {
          // Ordenação padrão para outras colunas (case-insensitive, com acentos)
          return sortDirection === 'asc'
            ? normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue))
            : normalizeForComparison(bValue).localeCompare(normalizeForComparison(aValue));
        }
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  // Contagem de atrasos
  const overdueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    return filteredAndSortedData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      const parts = dataLimiteStr.split('/');
      if (parts.length !== 3) return false;

      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const dataLimite = new Date(year, month, day);
      dataLimite.setHours(0, 0, 0, 0);

      // Atrasado se a data limite for anterior a hoje
      return dataLimite < today;
    }).length;
  }, [filteredAndSortedData]);

  // Função para determinar a classe CSS da linha
  const getRowClass = useCallback((row) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataLimiteStr = row['Data Limite'];
    if (!dataLimiteStr) return 'row-default-blue'; // Default para linhas sem data

    const parts = dataLimiteStr.split('/');
    if (parts.length !== 3) return 'row-default-blue'; // Default para datas inválidas

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const dataLimite = new Date(year, month, day);
    dataLimite.setHours(0, 0, 0, 0);

    const isOverdue = dataLimite < today;
    const isDueToday = dataLimite.getTime() === today.getTime();

    if (isOverdue) {
      return 'row-overdue'; // Vermelho intenso
    } else if (isDueToday) {
      return 'row-due-today'; // Amarelo
    } else {
      return 'row-default-blue'; // Azul claro para outras linhas
    }
  }, []);

  // Função para determinar o texto da célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'] || '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!dataLimiteStr) return justificativa;

    const parts = dataLimiteStr.split('/');
    if (parts.length !== 3) return justificativa;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const dataLimite = new Date(year, month, day);
    dataLimite.setHours(0, 0, 0, 0);

    const isOverdue = dataLimite < today;

    if (isOverdue && justificativa.trim() === '') {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, []);

  // Função para determinar o estilo da célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'] || '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!dataLimiteStr) return {};

    const parts = dataLimiteStr.split('/');
    if (parts.length !== 3) return {};

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const dataLimite = new Date(year, month, day);
    dataLimite.setHours(0, 0, 0, 0);

    const isOverdue = dataLimite < today;

    if (isOverdue && justificativa.trim() === '') {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, []);

  // Função para obter o ícone de ordenação
  const getSortIcon = useCallback((column) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? faSortUp : faSortDown;
    }
    return faSort;
  }, [sortColumn, sortDirection]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filtra apenas os itens atrasados e vencendo hoje
    const pendingTodayData = filteredAndSortedData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      const parts = dataLimiteStr.split('/');
      if (parts.length !== 3) return false;

      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const dataLimite = new Date(year, month, day);
      dataLimite.setHours(0, 0, 0, 0);

      const isOverdue = dataLimite < today;
      const isDueToday = dataLimite.getTime() === today.getTime();

      return isOverdue || isDueToday;
    });

    if (pendingTodayData.length === 0) {
      alert('Não há itens pendentes para hoje para exportar.');
      return;
    }

    // Mapeia os dados para o formato da planilha, aplicando formatação de data e texto "FALTA ABONAR"
    const dataForExcel = pendingTodayData.map(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        if (header === 'Data Limite') {
          newRow[header] = formatDataLimite(row[header]);
        } else if (header === 'Justificativa do Abono') {
          newRow[header] = getJustificativaCellText(row);
        } else {
          newRow[header] = row[header];
        }
      });
      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');

    // --- APLICAÇÃO DE ESTILOS NO EXCEL ---

    // 1. Estilo dos Cabeçalhos
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFFFF" } }, // Branco
      fill: { fgColor: { rgb: "FF336699" } }, // Azul escuro
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Aplica o estilo aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // 2. Estilo das Células de Dados (Cores de Fundo e Texto)
    pendingTodayData.forEach((row, rowIndex) => {
      const excelRowIndex = rowIndex + 1; // +1 por causa do cabeçalho

      const dataLimiteStr = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'] || '';

      const isOverdue = getRowClass(row) === 'row-overdue'; // Reutiliza a lógica de atraso
      const isDueToday = getRowClass(row) === 'row-due-today'; // Reutiliza a lógica de vencimento hoje

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRowIndex, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = { v: dataForExcel[rowIndex][header] }; // Garante que a célula exista com o valor
        if (!ws[cellRef].s) ws[cellRef].s = {}; // Inicializa o objeto de estilo se não existir

        // Estilo padrão para o texto (preto)
        ws[cellRef].s.font = { color: { rgb: "FF000000" } }; // Texto preto por padrão

        // Aplica a cor de fundo da linha
        if (isOverdue) {
          ws[cellRef].s.fill = { fgColor: { rgb: "FFC00000" } }; // Vermelho intenso
          ws[cellRef].s.font.color = { rgb: "FFFFFFFF" }; // Texto branco
        } else if (isDueToday) {
          ws[cellRef].s.fill = { fgColor: { rgb: "FFFFC000" } }; // Amarelo
          ws[cellRef].s.font.color = { rgb: "FF000000" }; // Texto preto
        } else {
          // Para linhas que não são atrasadas nem vencendo hoje, mas estão no filtro de "pendentes hoje"
          // Isso pode acontecer se a lógica de "pendentes hoje" for mais ampla que apenas atrasados/vencendo hoje
          // Ou se houver uma linha que foi filtrada mas não se encaixa nas cores principais
          // Por enquanto, vamos manter o padrão do Excel ou um azul claro se necessário.
          // Para este caso, como o filtro é *apenas* atrasados e vencendo hoje, essa branch não deve ser atingida.
        }

        // Sobrescreve para a célula "Justificativa do Abono" se for "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && getJustificativaCellText(row) === 'FALTA ABONAR') {
          ws[cellRef].s.fill = { fgColor: { rgb: "FF800080" } }; // Roxo intenso
          ws[cellRef].s.font.color = { rgb: "FFFFFFFF" }; // Texto branco
          ws[cellRef].s.font.bold = true;
        }

        // Adiciona bordas a todas as células
        ws[cellRef].s.border = {
          top: { style: "thin", color: { rgb: "FF000000" } },
          bottom: { style: "thin", color: { rgb: "FF000000" } },
          left: { style: "thin", color: { rgb: "FF000000" } },
          right: { style: "thin", color: { rgb: "FF000000" } },
        };

        // Formato de texto para CNPJ / CPF para evitar conversão para número
        if (header === 'CNPJ / CPF') {
          ws[cellRef].t = 's'; // Define o tipo da célula como string
          ws[cellRef].z = '@'; // Define o formato como texto
        }
      });
    });

    // 3. Ajuste de Largura das Colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Chamado') width = 12;
      else if (header === 'Numero Referencia') width = 18;
      else if (header === 'Contratante') width = 25;
      else if (header === 'Serviço') width = 30;
      else if (header === 'Status') width = 15;
      else if (header === 'Data Limite') width = 15;
      else if (header === 'Cliente') width = 25;
      else if (header === 'CNPJ / CPF') width = 20;
      else if (header === 'Cidade') width = 18;
      else if (header === 'Técnico') width = 25;
      else if (header === 'Prestador') width = 25;
      else if (header === 'Justificativa do Abono') width = 40;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // 4. Salvar o arquivo
    XLSX.writeFile(wb, 'Pendentes_Hoje.xlsx');

  }, [filteredAndSortedData, tableHeaders, formatDataLimite, getJustificativaCellText, getRowClass]); // Adicionado getRowClass às dependências

  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de Chamados</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="csvFile" className="custom-file-upload">
              {fileName ? `Arquivo: ${fileName}` : 'Selecionar CSV'}
            </label>
            <input
              id="csvFile"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="overdue-count">
              Atrasos: {overdueCount}
            </div>
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Pesquisar na tabela..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} disabled={data.length === 0} className="export-button">
              Exportar Pendentes Hoje
            </button>
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
                  <th key={header}>
                    <div className="th-content">
                      <div className="th-text" onClick={() => handleSort(header)}>
                        {header}
                        <FontAwesomeIcon icon={getSortIcon(header)} className="sort-icon" />
                      </div>
                      <div className="filter-container">
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${openFilterDropdown === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {openFilterDropdown === header && (
                          <div className="filter-dropdown" ref={filterDropdownRef}>
                            <div className="filter-options-container">
                              {Array.from(new Set(data.map(row => String(row[header] || '')))) // Garante string para map
                                .filter(option => option !== undefined && option !== null && option !== '') // Filtra valores vazios
                                .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)))
                                .map(option => (
                                  <label key={option} className="filter-option">
                                    <input
                                      type="checkbox"
                                      checked={selectedFilterOptions[header]?.includes(option) || false}
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
